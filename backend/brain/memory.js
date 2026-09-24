const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFrontmatter, getNoteTags } = require('./properties');
const { searchNotes } = require('./search');
const { semanticSearch } = require('./semantic');
const { extractMemoryWithAI } = require('./memory_ai');

/**
 * Generates a stable deterministic memory ID from content string or random fallback.
 */
function generateMemoryId(content) {
  if (content && typeof content === 'string') {
    const hash = crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex').substring(0, 12);
    return `mem_${hash}`;
  }
  return `mem_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Normalizes content text for strict comparisons.
 */
function normalizeContent(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministic Rule-Based Memory Extractor (Original).
 */
function extractMemoryRules(input, options = {}) {
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

  if (!textInput.trim()) {
    return { memories: [] };
  }

  const lines = textInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rawMemories = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Ignore temporary chat chatter & greetings
    if (/^(hi|hello|hey|siapa|apa khabar|ok|thanks|terima kasih|bye|good morning|good night)\b/i.test(lower)) {
      continue;
    }

    // Rule 1: User Preferences
    if (/(saya|i)\s+(suka|gemar|prefer|pilih|favorite|tidak suka|benci)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      rawMemories.push({
        content,
        type: 'preference',
        category: 'user',
        importance: 0.8,
        confidence: 0.9,
        tags: ['preference', 'user'],
        suggestedPath: `Users/pref_${generateMemoryId(content)}.md`
      });
      continue;
    }

    // Rule 2: User Facts
    if (/(nama saya|saya seorang|i am a|my name is|saya bekerja|umur saya)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      rawMemories.push({
        content,
        type: 'fact',
        category: 'user',
        importance: 0.85,
        confidence: 0.95,
        tags: ['fact', 'user'],
        suggestedPath: `Users/fact_${generateMemoryId(content)}.md`
      });
      continue;
    }

    // Rule 3: Goals
    if (/(matlamat|goal|target|saya mahu|i want to|impian)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      rawMemories.push({
        content,
        type: 'goal',
        category: 'project',
        importance: 0.8,
        confidence: 0.85,
        tags: ['goal', 'project'],
        suggestedPath: `Projects/goal_${generateMemoryId(content)}.md`
      });
      continue;
    }

    // Rule 4: Project Info
    if (/(projek|project|sistem|aplikasi|sumber)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      rawMemories.push({
        content,
        type: 'project',
        category: 'project',
        importance: 0.75,
        confidence: 0.8,
        tags: ['project'],
        suggestedPath: `Projects/proj_${generateMemoryId(content)}.md`
      });
      continue;
    }

    // Rule 5: Knowledge Facts
    if (/(definisi|fakta|konsep|teori|maksud)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      rawMemories.push({
        content,
        type: 'knowledge',
        category: 'knowledge',
        importance: 0.7,
        confidence: 0.8,
        tags: ['knowledge'],
        suggestedPath: `Knowledge/know_${generateMemoryId(content)}.md`
      });
      continue;
    }
  }

  const validMemories = rawMemories.filter(m => m.confidence >= confidenceThreshold);

  return { memories: validMemories };
}

/**
 * Unified Memory Extractor supporting mode: "rules", "llm", or "auto" (with deterministic fallback).
 *
 * @param {string|Array|object} input Conversation or text input
 * @param {object} [options] Options: mode ("rules"|"llm"|"auto"), llmExtractor, customExtractor, confidenceThreshold
 * @returns {Promise<{ memories: Array<object> }>}
 */
async function extractMemory(input, options = {}) {
  const mode = options.mode || 'rules';

  // Support legacy customExtractor testing option
  if (typeof options.customExtractor === 'function') {
    const confidenceThreshold = typeof options.confidenceThreshold === 'number' ? options.confidenceThreshold : 0.6;
    const customResult = await options.customExtractor(input, options);
    const filtered = (customResult?.memories || []).filter(m => (m.confidence ?? 1.0) >= confidenceThreshold);
    return { memories: filtered };
  }

  if (mode === 'rules') {
    return extractMemoryRules(input, options);
  }

  if (mode === 'llm') {
    return await extractMemoryWithAI(input, options);
  }

  if (mode === 'auto') {
    try {
      const aiResult = await extractMemoryWithAI(input, options);
      if (aiResult && Array.isArray(aiResult.memories) && aiResult.memories.length > 0) {
        return aiResult;
      }
    } catch (err) {
      console.warn('Memory Auto Extractor Warning (falling back to rules):', err.message);
    }
    // Fallback to rules if LLM fails, times out, or returns 0 memories
    return extractMemoryRules(input, options);
  }

  return extractMemoryRules(input, options);
}

/**
 * Finds if an existing memory already exists in vault to prevent duplicates.
 */
async function findExistingMemory(vaultDir, memory, options = {}) {
  if (!vaultDir || !memory || (!memory.content && !memory.id)) {
    return { found: false };
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return { found: false };
  }

  const normTarget = normalizeContent(memory.content);

  // 1. Scan vault files for matching ID or exact content
  const mdFiles = getAllMdFiles(absoluteVault, absoluteVault);
  for (const filePath of mdFiles) {
    try {
      const relativePath = path.relative(absoluteVault, filePath).replace(/\\/g, '/');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);

      if (memory.id && frontmatter.id === memory.id) {
        return {
          found: true,
          path: relativePath,
          existingFrontmatter: frontmatter,
          existingContent: body
        };
      }

      if (normTarget && normalizeContent(body) === normTarget) {
        return {
          found: true,
          path: relativePath,
          existingFrontmatter: frontmatter,
          existingContent: body
        };
      }
    } catch (e) {
      // Ignore
    }
  }

  // 2. Full-Text Search check for high relevance
  if (memory.content) {
    const ftResults = searchNotes(absoluteVault, memory.content);
    if (ftResults.length > 0 && ftResults[0].score >= 8) {
      const topMatch = ftResults[0];
      const fullPath = path.join(absoluteVault, topMatch.path);
      if (fs.existsSync(fullPath)) {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(raw);
        if (normalizeContent(body) === normTarget || (memory.id && frontmatter.id === memory.id)) {
          return {
            found: true,
            path: topMatch.path,
            existingFrontmatter: frontmatter,
            existingContent: body
          };
        }
      }
    }
  }

  // 3. Semantic Search check
  if (memory.content) {
    try {
      const semResults = await semanticSearch(absoluteVault, memory.content, {
        topK: 1,
        threshold: 0.95,
        customEmbedder: options.customEmbedder
      });
      if (semResults.length > 0) {
        const topSem = semResults[0];
        const fullPath = path.join(absoluteVault, topSem.path);
        if (fs.existsSync(fullPath)) {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const { frontmatter, body } = parseFrontmatter(raw);
          return {
            found: true,
            path: topSem.path,
            existingFrontmatter: frontmatter,
            existingContent: body
          };
        }
      }
    } catch (e) {
      // Fallback
    }
  }

  return { found: false };
}

/**
 * Saves a new structured memory into vault as a Markdown note with frontmatter.
 */
async function saveMemory(vaultDir, memory, options = {}) {
  if (!vaultDir || !memory || !memory.content || typeof memory.content !== 'string' || !memory.content.trim()) {
    throw new Error('Invalid Memory Error: Memory content is required.');
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    fs.mkdirSync(absoluteVault, { recursive: true });
  }

  // 1. Duplicate check
  const dupCheck = await findExistingMemory(absoluteVault, memory, options);
  if (dupCheck.found) {
    return {
      created: false,
      duplicate: true,
      path: dupCheck.path,
      memory: {
        ...memory,
        id: dupCheck.existingFrontmatter?.id || memory.id,
        path: dupCheck.path
      }
    };
  }

  // 2. Determine target path & path traversal security check
  const memId = memory.id || generateMemoryId(memory.content);
  let targetRelPath = memory.suggestedPath || memory.path;

  if (!targetRelPath) {
    const folder = getFolderForType(memory.type || memory.category);
    targetRelPath = `${folder}/mem_${memId}.md`;
  }

  if (!targetRelPath.endsWith('.md')) {
    targetRelPath += '.md';
  }

  const targetFullPath = path.resolve(absoluteVault, targetRelPath);

  // Security Check: Path Traversal Protection
  if (!targetFullPath.startsWith(absoluteVault + path.sep) && targetFullPath !== absoluteVault) {
    throw new Error(`Security Violation: Path traversal detected for "${targetRelPath}"`);
  }

  const parentDir = path.dirname(targetFullPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // 3. Format Markdown content with YAML frontmatter
  const now = new Date().toISOString();
  const title = memory.title || (memory.content.length > 40 ? memory.content.substring(0, 40) + '...' : memory.content);
  const tags = Array.isArray(memory.tags) ? Array.from(new Set(memory.tags)) : [memory.type || 'memory'];

  const frontmatterObj = {
    id: memId,
    title,
    type: memory.type || 'fact',
    category: memory.category || 'memory',
    tags,
    created: now,
    updated: now,
    importance: memory.importance ?? 0.7,
    confidence: memory.confidence ?? 0.9
  };

  const yamlBlock = buildYamlFrontmatter(frontmatterObj);
  const markdownText = `${yamlBlock}\n${memory.content.trim()}\n`;

  fs.writeFileSync(targetFullPath, markdownText, 'utf-8');

  const relResultPath = path.relative(absoluteVault, targetFullPath).replace(/\\/g, '/');

  return {
    created: true,
    path: relResultPath,
    memory: {
      ...memory,
      id: memId,
      title,
      path: relResultPath,
      createdAt: now,
      updatedAt: now
    }
  };
}

/**
 * Updates an existing memory note in vault safely.
 */
async function updateMemory(vaultDir, notePath, updates = {}, options = {}) {
  if (!vaultDir || !notePath) {
    throw new Error('Update Memory Error: vaultDir and notePath are required.');
  }

  const absoluteVault = path.resolve(vaultDir);
  let cleanRelPath = notePath.trim();
  if (!cleanRelPath.endsWith('.md')) {
    cleanRelPath += '.md';
  }

  const targetFullPath = path.resolve(absoluteVault, cleanRelPath);

  // Security Check: Path Traversal Protection
  if (!targetFullPath.startsWith(absoluteVault + path.sep) && targetFullPath !== absoluteVault) {
    throw new Error(`Security Violation: Path traversal detected for "${notePath}"`);
  }

  if (!fs.existsSync(targetFullPath)) {
    throw new Error(`Update Memory Error: File "${cleanRelPath}" does not exist in vault.`);
  }

  const raw = fs.readFileSync(targetFullPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const now = new Date().toISOString();

  const updatedFrontmatter = {
    ...frontmatter,
    id: frontmatter.id || generateMemoryId(body),
    title: updates.title || frontmatter.title,
    type: updates.type || frontmatter.type || 'fact',
    tags: updates.tags ? Array.from(new Set(updates.tags)) : frontmatter.tags,
    importance: updates.importance ?? frontmatter.importance,
    confidence: updates.confidence ?? frontmatter.confidence,
    created: frontmatter.created || now,
    updated: now
  };

  const updatedBody = updates.content !== undefined ? updates.content.trim() : body.trim();
  const yamlBlock = buildYamlFrontmatter(updatedFrontmatter);
  const markdownText = `${yamlBlock}\n${updatedBody}\n`;

  fs.writeFileSync(targetFullPath, markdownText, 'utf-8');

  const relResultPath = path.relative(absoluteVault, targetFullPath).replace(/\\/g, '/');

  return {
    updated: true,
    path: relResultPath,
    frontmatter: updatedFrontmatter
  };
}

function buildYamlFrontmatter(obj) {
  let lines = ['---'];
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;

    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof val === 'object') {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
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

function getAllMdFiles(dir, absoluteVault) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (!fullPath.startsWith(absoluteVault + path.sep) && fullPath !== absoluteVault) {
      continue;
    }

    if (entry.isDirectory()) {
      results = results.concat(getAllMdFiles(fullPath, absoluteVault));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

module.exports = {
  extractMemory,
  findExistingMemory,
  saveMemory,
  updateMemory
};
