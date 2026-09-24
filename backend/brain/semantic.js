const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFrontmatter, getNoteTags } = require('./properties');

/**
 * Calculates cosine similarity between two vectors.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
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

/**
 * Computes MD5 hash of string content.
 */
function hashContent(content) {
  return crypto.createHash('md5').update(content || '').digest('hex');
}

/**
 * Creates an embedding for a text using configured provider or custom embedder.
 * Default provider checks environment variables: OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY.
 * Fallback / mock support provided when custom embedder passed in options for testing.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<number[]>}
 */
async function createEmbedding(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Allow custom embedder override (useful for testing & offline mode)
  if (typeof options.customEmbedder === 'function') {
    return await options.customEmbedder(text);
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Embedding Provider Error: No API key configured. Set OPENAI_API_KEY or OPENROUTER_API_KEY or GEMINI_API_KEY.');
  }

  // Basic fetch call if API key provided (OpenAI embeddings endpoint standard)
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

/**
 * Creates embeddings for multiple texts in batch.
 *
 * @param {string[]} texts
 * @param {object} [options]
 * @returns {Promise<number[][]>}
 */
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

/**
 * Loads vector index from vault/.index/vector_index.json cleanly.
 */
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
    // Corrupted index handling
    console.warn('Vector Index Error: Corrupted index file detected. Re-initializing index.');
    return {};
  }
}

/**
 * Saves vector index to vault/.index/vector_index.json safely.
 */
function saveIndex(indexDir, indexData) {
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  const indexFilePath = path.join(indexDir, 'vector_index.json');
  fs.writeFileSync(indexFilePath, JSON.stringify(indexData, null, 2), 'utf-8');
}

/**
 * Synchronizes vector index with current files in vault.
 * Handles additions, updates (via hash comparison), and deletions.
 */
async function syncIndex(vaultDir, options = {}) {
  const absoluteVault = path.resolve(vaultDir);
  const indexDir = path.join(absoluteVault, '.index');

  const currentIndex = loadIndex(indexDir);
  const currentFiles = getAllMdFiles(absoluteVault, absoluteVault);

  const existingPathsSet = new Set();
  let updatedCount = 0;

  // 1. Process existing files (add / update)
  for (const filePath of currentFiles) {
    const relativePath = path.relative(absoluteVault, filePath).replace(/\\/g, '/');

    // Skip indexing files inside .index directory
    if (relativePath.startsWith('.index/')) {
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

      // Check if unchanged
      if (existingEntry && existingEntry.contentHash === contentHash && Array.isArray(existingEntry.embedding) && existingEntry.embedding.length > 0) {
        continue;
      }

      // Generate embedding for new/modified content
      const textToEmbed = `${name}\n${tags.join(' ')}\n${body}`.trim();
      const embedding = await createEmbedding(textToEmbed, options);

      currentIndex[relativePath] = {
        path: relativePath,
        name,
        tags,
        contentHash,
        embedding,
        updatedAt: new Date().toISOString()
      };

      updatedCount++;
    } catch (err) {
      // If embedding fails (e.g. no API key configured), rethrow error cleanly
      throw err;
    }
  }

  // 2. Remove deleted files from index
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
 * Performs semantic / vector search over vault notes.
 *
 * @param {string} vaultDir Path to vault
 * @param {string} query Search query string
 * @param {object} [options] Options: topK, threshold, customEmbedder
 * @returns {Promise<Array<{ path: string, name: string, score: number, snippet: string, matchedMetadata: object }>>}
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

  // 1. Sync & get current index
  const index = await syncIndex(absoluteVault, options);
  const entries = Object.values(index);

  if (entries.length === 0) {
    return [];
  }

  // 2. Embed search query
  const queryEmbedding = await createEmbedding(cleanQuery, options);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return [];
  }

  const results = [];

  // 3. Compute cosine similarity against indexed notes
  for (const entry of entries) {
    if (!entry.embedding || !Array.isArray(entry.embedding)) {
      continue;
    }

    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
    if (similarity >= threshold) {
      // Read snippet from file
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
          updatedAt: entry.updatedAt
        }
      });
    }
  }

  // 4. Sort descending by score and slice topK
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Recursively scans directory for markdown files with path traversal security check.
 */
function getAllMdFiles(dir, absoluteVault) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Path traversal check
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
  cosineSimilarity,
  createEmbedding,
  createEmbeddings,
  semanticSearch,
  syncIndex
};
