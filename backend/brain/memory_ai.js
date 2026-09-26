const crypto = require('crypto');
const askOpenRouter = require('../openrouter');

const ALLOWED_TYPES = new Set([
  'fact',
  'preference',
  'goal',
  'project',
  'instruction',
  'relationship',
  'knowledge'
]);

function generateMemoryId(content) {
  if (content && typeof content === 'string') {
    const hash = crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex').substring(0, 12);
    return `mem_${hash}`;
  }
  return `mem_${crypto.randomBytes(6).toString('hex')}`;
}

function getFolderForType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'user' || t === 'preference' || t === 'fact' || t === 'relationship') {
    return 'Users';
  }
  if (t === 'project' || t === 'goal') {
    return 'Projects';
  }
  if (t === 'knowledge' || t === 'instruction') {
    return 'Knowledge';
  }
  return 'Memory';
}

/**
 * Provider-agnostic AI Memory Extraction Adapter.
 * Responsible ONLY for building extraction instructions, invoking the injected `llmExtractor`,
 * validating structured memory schemas, applying confidence thresholding, and enforcing anti-hallucination source verification.
 *
 * @param {string|Array|object} input Input text or conversation
 * @param {object} options Options containing injected `llmExtractor` and `confidenceThreshold`
 * @returns {Promise<{ memories: Array<object> }>}
 */
async function extractMemoryWithAI(input, options = {}) {
  const confidenceThreshold = typeof options.confidenceThreshold === 'number' ? options.confidenceThreshold : 0.6;

  if (!input) {
    return { memories: [] };
  }

  let textInput = '';
  if (Array.isArray(input)) {
    textInput = input.map(msg => typeof msg === 'string' ? msg : `${msg.role || 'user'}: ${msg.content || ''}`).join('\n');
  } else if (typeof input === 'string') {
    textInput = input;
  } else if (typeof input === 'object' && input.content) {
    textInput = String(input.content);
  }

  const cleanInput = textInput.trim();
  if (!cleanInput) {
    return { memories: [] };
  }

  // Use AXMchat's OpenRouter provider by default. A custom extractor can
  // still be injected for tests or alternative providers.
  const llmExtractor = options.llmExtractor || (async (text, extractorOptions = {}) => {
    const model = extractorOptions.model ||
      process.env.BRAIN_MEMORY_MODEL ||
      process.env.OPENROUTER_MEMORY_MODEL ||
      'openai/gpt-oss-20b:free';

    const system = [
      'You are AXMchat Brain Memory, an AI memory selector.',
      'Decide what durable information from the USER message should be remembered across future chats.',
      'Do NOT store greetings, casual conversation, temporary states, one-off requests, questions, jokes, or information invented by you.',
      'Prefer explicit user facts, identity, preferences, goals, projects, durable instructions, relationships, and useful knowledge the user explicitly states.',
      'Only extract information directly supported by the user message.',
      'Return JSON only with this exact shape: {"memories":[...]}',
      'Each memory must contain content, type, category, importance, confidence, tags, and source.',
      'type must be one of fact, preference, goal, project, instruction, relationship, knowledge.',
      'importance and confidence must be numbers from 0 to 1.',
      'source must be an EXACT short quote copied verbatim from the user message.',
      'If nothing deserves to be remembered, return {"memories":[]}.',
      'Never include assistant text or assumptions.'
    ].join('\\n');

    const raw = await askOpenRouter(text, {
      model,
      fallbackModel: extractorOptions.fallbackModel ||
        process.env.BRAIN_MEMORY_FALLBACK_MODEL ||
        'openrouter/free',
      system
    });

    let jsonText = String(raw || '').trim();
    if (jsonText.startsWith('\\`\\`\\`')) {
      jsonText = jsonText
        .replace(/^\\`\\`\\`(?:json)?\\s*/i, '')
        .replace(/\\s*\\`\\`\\`$/i, '')
        .trim();
    }

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      const start = jsonText.indexOf('{');
      const end = jsonText.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(jsonText.slice(start, end + 1));
      }
      throw new Error('Memory AI returned invalid JSON.');
    }
  });

  const rawOutput = await llmExtractor(cleanInput, options);

  if (!rawOutput || typeof rawOutput !== 'object' || !Array.isArray(rawOutput.memories)) {
    throw new Error('Invalid LLM Output Error: Response does not contain a valid "memories" array.');
  }

  const validMemories = [];
  const lowerInputText = cleanInput.toLowerCase();

  for (const item of rawOutput.memories) {
    if (!item || typeof item !== 'object') continue;

    const { content, type, category, importance, confidence, tags, source } = item;

    // Validation 1: Content
    if (!content || typeof content !== 'string' || !content.trim() || content.length > 500) {
      continue;
    }

    // Validation 2: Memory Type
    if (!type || !ALLOWED_TYPES.has(String(type).toLowerCase())) {
      continue;
    }

    // Validation 3: Confidence & Importance
    const numConf = Number(confidence);
    const numImp = Number(importance);
    if (isNaN(numConf) || numConf < 0 || numConf > 1.0) continue;
    if (isNaN(numImp) || numImp < 0 || numImp > 1.0) continue;

    // Confidence threshold filter
    if (numConf < confidenceThreshold) continue;

    // Validation 4: Anti-Hallucination & Traceable Source Check
    if (!source || typeof source !== 'string' || !source.trim()) {
      continue;
    }

    const cleanSource = source.trim().toLowerCase();
    // Verify source phrase exists in the input text
    if (!lowerInputText.includes(cleanSource)) {
      console.warn(`Anti-Hallucination Guard: Rejected memory "${content}" - source "${source}" not found in input.`);
      continue;
    }

    const memType = String(type).toLowerCase();
    const memCat = category ? String(category).toLowerCase() : getFolderForType(memType).toLowerCase();
    const folder = getFolderForType(memType);
    const cleanContent = content.trim();
    const memId = generateMemoryId(cleanContent);

    validMemories.push({
      id: memId,
      content: cleanContent,
      type: memType,
      category: memCat,
      importance: numImp,
      confidence: numConf,
      tags: Array.isArray(tags) ? Array.from(new Set(tags.map(t => String(t).toLowerCase()))) : [memType],
      source: source.trim(),
      suggestedPath: `${folder}/mem_${memId}.md`
    });
  }

  return {
    memories: validMemories
  };
}

module.exports = {
  extractMemoryWithAI,
  ALLOWED_TYPES
};
