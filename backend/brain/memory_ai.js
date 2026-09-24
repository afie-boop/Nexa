const crypto = require('crypto');

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
 * Extracts structured memories using LLM extractor with strict validation and anti-hallucination checks.
 *
 * @param {string|Array|object} input Input text or conversation
 * @param {object} [options] Options: llmExtractor, confidenceThreshold
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

  // Check if LLM Extractor provided or fallback to OpenRouter / OpenAI if env configured
  let llmExtractor = options.llmExtractor;

  if (!llmExtractor && (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)) {
    llmExtractor = async (promptText) => {
      const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
      const endpoint = process.env.OPENROUTER_API_KEY
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = process.env.MEMORY_LLM_MODEL || 'openai/gpt-4o-mini';

      const systemPrompt = `You are an AI Memory Extraction System. Extract long-term facts, preferences, goals, projects, instructions, relationships, and knowledge from the conversation.
Return ONLY a JSON object with this exact format:
{
  "memories": [
    {
      "content": "...",
      "type": "fact|preference|goal|project|instruction|relationship|knowledge",
      "category": "user|project|knowledge|memory",
      "importance": 0.0-1.0,
      "confidence": 0.0-1.0,
      "tags": ["tag1"],
      "source": "exact phrase from input text supporting this memory"
    }
  ]
}
Do NOT infer unstated facts. Source MUST be an exact string present in input text.`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`LLM Extractor HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      return JSON.parse(content);
    };
  }

  if (!llmExtractor || typeof llmExtractor !== 'function') {
    throw new Error('LLM Extractor Error: No llmExtractor provided or API keys configured.');
  }

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
