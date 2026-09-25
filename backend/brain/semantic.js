const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFrontmatter, getNoteTags } = require('./properties');
const { isNoteInScope } = require('./memory_scope');

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function hashContent(content) {
  return crypto.createHash('md5').update(content || '').digest('hex');
}

async function createEmbedding(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  if (typeof options.customEmbedder === 'function') {
    return await options.customEmbedder(text);
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Embedding Provider Error: No API key configured. Set OPENAI_API_KEY or OPENROUTER_API_KEY or GEMINI_API_KEY.');
  }

  const endpoint = process.env.EMBEDDING_API_URL || 'https://api.openai.com/v1/embeddings';
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input: text,
      model: model
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data && data.data && data.data[0] && data.data[0].embedding) {
    return data.data[0].embedding;
  }

  throw new Error('Embedding API Error: Invalid response format received from provider.');
}

async function createEmbeddings(texts, options = {}) {
  if (!Array.isArray(texts)) {
    return [];
  }

  const embeddings = [];
  for (const text of texts) {
    const emb = await createEmbedding(text, options);
    embeddings.push(emb);
  }
  return embeddings;
}

function loadIndex(indexDir) {
  const indexFilePath = path.join(indexDir, 'vector_index.json');
  if (!fs.existsSync(indexFilePath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(indexFilePath, 'utf-8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data !== null ? data : {};
  } catch (err) {
    console.warn('Vector Index Error: Corrupted index file detected. Re-initializing index.');
    return {};
  }
}

function saveIndex(indexDir, indexData) {
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  const indexFilePath = path.join(indexDir, 'vector_index.json');
  fs.writeFileSync(indexFilePath, JSON.stringify(indexData, null, 2), 'utf-8');
}

async function syncIndex(vaultDir, options = {}) {
  const absoluteVault = path.resolve(vaultDir);
  const indexDir = path.join(absoluteVault, '.index');

  const currentIndex = loadIndex(indexDir);
  const currentFiles = getAllMdFiles(absoluteVault, absoluteVault);

  const existingPathsSet = new Set();
  let updatedCount = 0;

  for (const filePath of currentFiles) {
    const relativePath = path.relative(absoluteVault, filePath).replace(/\\/g, '/');

    // Skip indexing Memory/History and .index
    if (relativePath.startsWith('.index/') || relativePath.startsWith('Memory/History/')) {
      continue;
    }

    existingPathsSet.add(relativePath);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = hashContent(content);
      const { frontmatter, body } = parseFrontmatter(content);
      const tags = getNoteTags(content);
      const name = frontmatter.title || path.basename(filePath, '.md');

      const existingEntry = currentIndex[relativePath];

      if (existingEntry && existingEntry.contentHash === contentHash && Array.isArray(existingEntry.embedding) && existingEntry.embedding.length > 0) {
        existingEntry.frontmatter = frontmatter;
        continue;
      }

      const textToEmbed = `${name}\n${tags.join(' ')}\n${body}`.trim();
      const embedding = await createEmbedding(textToEmbed, options);

      currentIndex[relativePath] = {
        path: relativePath,
        name,
        tags,
        contentHash,
        embedding,
        frontmatter,
        updatedAt: new Date().toISOString()
      };

      updatedCount++;
    } catch (err) {
      throw err;
    }
  }

  for (const indexedPath of Object.keys(currentIndex)) {
    if (!existingPathsSet.has(indexedPath)) {
      delete currentIndex[indexedPath];
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    saveIndex(indexDir, currentIndex);
  }

  return currentIndex;
}

/**
 * Performs semantic search with scope filtering. Excludes Memory/History snapshots.
 */
async function semanticSearch(vaultDir, query, options = {}) {
  if (!vaultDir || !query || typeof query !== 'string') {
    return [];
  }

  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return [];
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return [];
  }

  const topK = typeof options.topK === 'number' && options.topK > 0 ? options.topK : 5;
  const threshold = typeof options.threshold === 'number' ? options.threshold : 0.0;
  const filterScope = options.scope !== undefined ? options.scope : null;

  const index = await syncIndex(absoluteVault, options);
  const entries = Object.values(index);

  if (entries.length === 0) {
    return [];
  }

  const queryEmbedding = await createEmbedding(cleanQuery, options);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return [];
  }

  const results = [];

  for (const entry of entries) {
    if (!entry.embedding || !Array.isArray(entry.embedding)) {
      continue;
    }

    // Exclude Memory/History snapshots
    if (entry.path.startsWith('Memory/History/')) {
      continue;
    }

    // Scope Isolation Check
    const noteFrontmatter = entry.frontmatter || {};
    if (!isNoteInScope(noteFrontmatter, filterScope)) {
      continue;
    }

    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
    if (similarity >= threshold) {
      let snippet = '';
      try {
        const fullPath = path.join(absoluteVault, entry.path);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const { body } = parseFrontmatter(content);
          snippet = body.substring(0, 150).replace(/\r?\n|\r/g, ' ').trim();
          if (body.length > 150) snippet += '...';
        }
      } catch (e) {
        // Snippet fallback
      }

      results.push({
        path: entry.path,
        name: entry.name,
        score: similarity,
        snippet,
        matchedMetadata: {
          tags: entry.tags || [],
          frontmatter: noteFrontmatter,
          updatedAt: entry.updatedAt
        }
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
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
  cosineSimilarity,
  createEmbedding,
  createEmbeddings,
  semanticSearch,
  syncIndex
};
