const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFrontmatter, getNoteTags } = require('./properties');
const { searchNotes } = require('./search');
const { semanticSearch } = require('./semantic');
const { extractMemoryWithAI } = require('./memory_ai');
const { normalizeScope, getScopeDirectory, isNoteInScope } = require('./memory_scope');
const { saveHistorySnapshot } = require('./memory_history');

function generateMemoryId(content, scope) {
  if (content && typeof content === 'string') {
    const scopeKey = scope ? `${scope.type || 'knowledge'}_${scope.userId || scope.projectId || scope.sessionId || ''}` : '';
    const hash = crypto.createHash('sha256').update((scopeKey + content).trim().toLowerCase()).digest('hex').substring(0, 12);
    return `mem_${hash}`;
  }
  return `mem_${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeContent(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
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

    if (/^(hi|hello|hey|siapa|apa khabar|ok|thanks|terima kasih|bye|good morning|good night)\b/i.test(lower)) {
      continue;
    }

    if (/(saya|i)\s+(suka|gemar|prefer|pilih|favorite|tidak suka|benci)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      const memId = generateMemoryId(content, options.scope);
      rawMemories.push({
        content,
        type: 'preference',
        category: 'user',
        importance: 0.8,
        confidence: 0.9,
        tags: ['preference', 'user'],
        suggestedPath: `Users/pref_${memId}.md`
      });
      continue;
    }

    if (/(nama saya|saya seorang|saya orang|aku seorang|aku orang|i am|i'm|my name is|saya bekerja|umur saya)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      const memId = generateMemoryId(content, options.scope);
      rawMemories.push({
        content,
        type: 'fact',
        category: 'user',
        importance: 0.85,
        confidence: 0.95,
        tags: ['fact', 'user'],
        suggestedPath: `Users/fact_${memId}.md`
      });
      continue;
    }

    if (/(matlamat|goal|target|saya mahu|i want to|impian)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      const memId = generateMemoryId(content, options.scope);
      rawMemories.push({
        content,
        type: 'goal',
        category: 'project',
        importance: 0.8,
        confidence: 0.85,
        tags: ['goal', 'project'],
        suggestedPath: `Projects/goal_${memId}.md`
      });
      continue;
    }

    if (/(projek|project|sistem|aplikasi|sumber)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      const memId = generateMemoryId(content, options.scope);
      rawMemories.push({
        content,
        type: 'project',
        category: 'project',
        importance: 0.75,
        confidence: 0.8,
        tags: ['project'],
        suggestedPath: `Projects/proj_${memId}.md`
      });
      continue;
    }

    if (/(definisi|fakta|konsep|teori|maksud)\b/i.test(lower)) {
      const content = line.replace(/^(user:|assistant:)\s*/i, '').trim();
      const memId = generateMemoryId(content, options.scope);
      rawMemories.push({
        content,
        type: 'knowledge',
        category: 'knowledge',
        importance: 0.7,
        confidence: 0.8,
        tags: ['knowledge'],
        suggestedPath: `Knowledge/know_${memId}.md`
      });
      continue;
    }
  }

  const validMemories = rawMemories.filter(m => m.confidence >= confidenceThreshold);

  return { memories: validMemories };
}

/**
 * Unified Memory Extractor supporting mode: "rules", "llm", or "auto" with scope awareness.
 */
async function extractMemory(input, options = {}) {
  const mode = options.mode || 'rules';

  if (typeof options.customExtractor === 'function') {
    const confidenceThreshold = typeof options.confidenceThreshold === 'number' ? options.confidenceThreshold : 0.6;
    const customResult = await options.customExtractor(input, options);
    const filtered = (customResult?.memories || []).filter(m => (m.confidence ?? 1.0) >= confidenceThreshold);
    return { memories: filtered };
  }

  let extracted;
  if (mode === 'rules') {
    extracted = extractMemoryRules(input, options);
  } else if (mode === 'llm') {
    extracted = await extractMemoryWithAI(input, options);
  } else if (mode === 'auto') {
    try {
      const aiResult = await extractMemoryWithAI(input, options);
      if (aiResult && Array.isArray(aiResult.memories) && aiResult.memories.length > 0) {
        extracted = aiResult;
      }
    } catch (err) {
      console.warn('Memory Auto Extractor Warning (falling back to rules):', err.message);
    }
    if (!extracted) {
      extracted = extractMemoryRules(input, options);
    }
  } else {
    extracted = extractMemoryRules(input, options);
  }

  if (options.scope && extracted && Array.isArray(extracted.memories)) {
    const normScope = normalizeScope(options.scope);
    extracted.memories = extracted.memories.map(m => ({
      ...m,
      scope: normScope
    }));
  }

  return extracted;
}

/**
 * Finds if an existing memory already exists within vault/scope to prevent duplicates.
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
  const scopeFilter = options.scope !== undefined ? options.scope : memory.scope;

  const mdFiles = getAllMdFiles(absoluteVault, absoluteVault);
  for (const filePath of mdFiles) {
    try {
      const relativePath = path.relative(absoluteVault, filePath).replace(/\\/g, '/');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);

      if (scopeFilter !== undefined && !isNoteInScope(frontmatter, scopeFilter)) {
        continue;
      }

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

  if (memory.content) {
    const ftResults = searchNotes(absoluteVault, memory.content, { scope: scopeFilter });
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

  if (memory.content) {
    try {
      const semResults = await semanticSearch(absoluteVault, memory.content, {
        topK: 1,
        threshold: 0.95,
        customEmbedder: options.customEmbedder,
        scope: scopeFilter
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
 * Saves a new structured memory into vault as a Markdown note with scope & version metadata.
 * Enforces authoritative scope directory confinement when private scope is provided.
 */
async function saveMemory(vaultDir, memory, options = {}) {
  if (!vaultDir || !memory || !memory.content || typeof memory.content !== 'string' || !memory.content.trim()) {
    throw new Error('Invalid Memory Error: Memory content is required.');
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    fs.mkdirSync(absoluteVault, { recursive: true });
  }

  const hasExplicitScope = options.scope !== undefined || memory.scope !== undefined;
  const scopeInput = options.scope !== undefined ? options.scope : memory.scope;
  const normScope = normalizeScope(scopeInput);

  // 1. Duplicate check within scope
  const dupCheck = await findExistingMemory(absoluteVault, memory, { ...options, scope: normScope });
  if (dupCheck.found) {
    return {
      created: false,
      duplicate: true,
      path: dupCheck.path,
      memory: {
        ...memory,
        id: dupCheck.existingFrontmatter?.id || memory.id,
        path: dupCheck.path,
        scope: normScope
      }
    };
  }

  // 2. Authoritative Scope Directory Determination
  const memId = memory.id || generateMemoryId(memory.content, normScope);
  const rawInputPath = memory.suggestedPath || memory.path || `mem_${memId}.md`;

  if (path.isAbsolute(rawInputPath) || rawInputPath.includes('..') || rawInputPath.includes('\\')) {
    throw new Error(`Security Violation: Path traversal detected in memory path "${rawInputPath}".`);
  }

  let targetRelPath;
  if (hasExplicitScope) {
    const scopeDir = getScopeDirectory(normScope);
    let rawFileName = path.basename(rawInputPath);
    if (!rawFileName || rawFileName === '.' || rawFileName === '.md') {
      rawFileName = `mem_${memId}.md`;
    }
    if (!rawFileName.endsWith('.md')) {
      rawFileName += '.md';
    }
    targetRelPath = `${scopeDir}/${rawFileName}`;
  } else {
    targetRelPath = rawInputPath;
    if (!targetRelPath.endsWith('.md')) {
      targetRelPath += '.md';
    }
  }

  const targetFullPath = path.resolve(absoluteVault, targetRelPath);

  if (!targetFullPath.startsWith(absoluteVault + path.sep) && targetFullPath !== absoluteVault) {
    throw new Error(`Security Violation: Path traversal escape detected for "${targetRelPath}".`);
  }

  if (hasExplicitScope) {
    const scopeDir = getScopeDirectory(normScope);
    const absoluteScopeDir = path.resolve(absoluteVault, scopeDir);
    if (!targetFullPath.startsWith(absoluteScopeDir + path.sep) && targetFullPath !== absoluteScopeDir) {
      throw new Error(`Security Violation: Target path "${targetRelPath}" escapes authoritative scope directory "${scopeDir}".`);
    }
  }

  const parentDir = path.dirname(targetFullPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // 3. Format Markdown content with YAML frontmatter + scope & version metadata
  const now = new Date().toISOString();
  const title = memory.title || (memory.content.length > 40 ? memory.content.substring(0, 40) + '...' : memory.content);
  const tags = Array.isArray(memory.tags) ? Array.from(new Set(memory.tags)) : [memory.type || 'memory'];
  const version = 1;

  const frontmatterObj = {
    id: memId,
    title,
    type: memory.type || 'fact',
    category: memory.category || 'memory',
    tags,
    version,
    created: now,
    updated: now,
    importance: memory.importance ?? 0.7,
    confidence: memory.confidence ?? 0.9,
    durability: memory.durability ?? 0.7,
    quality: memory.quality || undefined,
    consolidatedFrom: Array.isArray(memory.consolidatedFrom) ? memory.consolidatedFrom : undefined,
    // Scope metadata
    scopeType: normScope.type,
    userId: normScope.userId,
    projectId: normScope.projectId,
    sessionId: normScope.sessionId
  };

  const yamlBlock = buildYamlFrontmatter(frontmatterObj);
  const markdownText = `${yamlBlock}\n${memory.content.trim()}\n`;

  fs.writeFileSync(targetFullPath, markdownText, 'utf-8');

  // Save history snapshot v1
  saveHistorySnapshot(absoluteVault, {
    memoryId: memId,
    version: 1,
    operation: 'create',
    previousVersion: null,
    content: memory.content.trim(),
    frontmatter: frontmatterObj
  });

  const relResultPath = path.relative(absoluteVault, targetFullPath).replace(/\\/g, '/');

  return {
    created: true,
    path: relResultPath,
    memory: {
      ...memory,
      id: memId,
      title,
      version: 1,
      path: relResultPath,
      createdAt: now,
      updatedAt: now,
      scope: normScope
    }
  };
}

/**
 * Updates an existing memory note in vault safely and creates new version history snapshot.
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

  if (!targetFullPath.startsWith(absoluteVault + path.sep) && targetFullPath !== absoluteVault) {
    throw new Error(`Security Violation: Path traversal detected for "${notePath}"`);
  }

  if (!fs.existsSync(targetFullPath)) {
    throw new Error(`Update Memory Error: File "${cleanRelPath}" does not exist in vault.`);
  }

  const raw = fs.readFileSync(targetFullPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const filterScope = options.scope !== undefined ? options.scope : null;
  if (!isNoteInScope(frontmatter, filterScope)) {
    throw new Error(`Security Violation: Unauthorized scope update attempt on note "${notePath}".`);
  }

  const now = new Date().toISOString();
  const currentVersion = Number(frontmatter.version) || 1;
  const newVersion = currentVersion + 1;

  const updatedFrontmatter = {
    ...frontmatter,
    id: frontmatter.id || generateMemoryId(body, {
      type: frontmatter.scopeType || 'knowledge',
      userId: frontmatter.userId || undefined,
      projectId: frontmatter.projectId || undefined,
      sessionId: frontmatter.sessionId || undefined
    }),
    title: updates.title || frontmatter.title,
    type: updates.type || frontmatter.type || 'fact',
    tags: updates.tags ? Array.from(new Set(updates.tags)) : frontmatter.tags,
    importance: updates.importance ?? frontmatter.importance,
    confidence: updates.confidence ?? frontmatter.confidence,
    durability: updates.durability ?? frontmatter.durability,
    quality: updates.quality ?? frontmatter.quality,
    consolidatedFrom: updates.consolidatedFrom ?? frontmatter.consolidatedFrom,
    version: newVersion,
    created: frontmatter.created || now,
    updated: now,
    scopeType: frontmatter.scopeType || 'knowledge',
    userId: frontmatter.userId || null,
    projectId: frontmatter.projectId || null,
    sessionId: frontmatter.sessionId || null
  };

  const updatedBody = updates.content !== undefined ? updates.content.trim() : body.trim();
  const yamlBlock = buildYamlFrontmatter(updatedFrontmatter);
  const markdownText = `${yamlBlock}\n${updatedBody}\n`;

  fs.writeFileSync(targetFullPath, markdownText, 'utf-8');

  // Save history snapshot v[newVersion]
  saveHistorySnapshot(absoluteVault, {
    memoryId: updatedFrontmatter.id,
    version: newVersion,
    operation: 'update',
    previousVersion: currentVersion,
    content: updatedBody,
    frontmatter: updatedFrontmatter
  });

  const relResultPath = path.relative(absoluteVault, targetFullPath).replace(/\\/g, '/');

  return {
    updated: true,
    path: relResultPath,
    version: newVersion,
    frontmatter: updatedFrontmatter
  };
}

function buildYamlFrontmatter(obj) {
  let lines = ['---'];
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;

    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof val === 'object' && val !== null) {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
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

    const relPath = path.relative(absoluteVault, fullPath).replace(/\\/g, '/');
    if (relPath.startsWith('Memory/History') || relPath.startsWith('.index')) {
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
