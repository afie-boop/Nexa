const path = require('path');
const {
  parseWikiLinks,
  getOutgoingLinks,
  resolveNotePath,
  getBacklinks
} = require('./wikilinks');
const {
  parseFrontmatter,
  parseInlineTags,
  getNoteTags,
  findNotesByTag
} = require('./properties');
const { buildGraph } = require('./graph');
const { searchNotes } = require('./search');
const {
  cosineSimilarity,
  createEmbedding,
  createEmbeddings,
  semanticSearch
} = require('./semantic');
const { retrieveContext } = require('./retrieval');
const {
  extractMemory,
  findExistingMemory,
  saveMemory,
  updateMemory
} = require('./memory');
const { extractMemoryWithAI } = require('./memory_ai');
const {
  sanitizeScopeId,
  normalizeScope,
  getScopeDirectory,
  isNoteInScope
} = require('./memory_scope');
const {
  getMemoryHistory,
  restoreMemory
} = require('./memory_history');
const { consolidateMemories } = require('./memory_consolidation');
const { inspectMemoryHealth } = require('./memory_maintenance');

// Brain module main entry point
class Brain {
  constructor(baseVaultDir) {
    this.vaultDir = baseVaultDir ? path.resolve(baseVaultDir) : path.resolve(__dirname, 'vault');
    this.memoryPath = path.join(this.vaultDir, 'Memory');
    this.knowledgePath = path.join(this.vaultDir, 'Knowledge');
    this.projectsPath = path.join(this.vaultDir, 'Projects');
    this.usersPath = path.join(this.vaultDir, 'Users');
  }

  async initialize() {
    console.log('Brain initialized successfully with vault at:', this.vaultDir);
  }

  // WikiLinks & Backlinks
  parseWikiLinks(content) {
    return parseWikiLinks(content);
  }

  getOutgoingLinks(content) {
    return getOutgoingLinks(content);
  }

  resolveNotePath(targetNote) {
    return resolveNotePath(this.vaultDir, targetNote);
  }

  getBacklinks(targetNote, options) {
    return getBacklinks(this.vaultDir, targetNote, options);
  }

  // Tags & Properties / YAML Frontmatter
  parseFrontmatter(content) {
    return parseFrontmatter(content);
  }

  parseInlineTags(text) {
    return parseInlineTags(text);
  }

  getNoteTags(content) {
    return getNoteTags(content);
  }

  findNotesByTag(targetTag) {
    return findNotesByTag(this.vaultDir, targetTag);
  }

  // Graph Builder
  buildGraph(options) {
    return buildGraph(this.vaultDir, options);
  }

  // Full-Text Search
  searchNotes(query, options) {
    return searchNotes(this.vaultDir, query, options);
  }

  // Semantic / Vector Search
  async semanticSearch(query, options) {
    return await semanticSearch(this.vaultDir, query, options);
  }

  // RAG Context Retrieval
  async retrieveContext(query, options) {
    return await retrieveContext(this.vaultDir, query, options);
  }

  // Memory Engine & Intelligence Layer
  async extractMemory(input, options) {
    return await extractMemory(input, options);
  }

  async extractMemoryWithAI(input, options) {
    return await extractMemoryWithAI(input, options);
  }

  async findExistingMemory(memory, options) {
    return await findExistingMemory(this.vaultDir, memory, options);
  }

  async saveMemory(memory, options) {
    return await saveMemory(this.vaultDir, memory, options);
  }

  async updateMemory(notePath, updates, options) {
    return await updateMemory(this.vaultDir, notePath, updates, options);
  }

  async consolidateMemories(options) {
    return await consolidateMemories(this, options);
  }

  inspectMemoryHealth(options) {
    return inspectMemoryHealth(this.vaultDir, options);
  }

  // Memory Scope Helpers
  normalizeScope(scopeInput) {
    return normalizeScope(scopeInput);
  }

  getScopeDirectory(normScope) {
    return getScopeDirectory(normScope);
  }

  isNoteInScope(noteMetadata, filterScope) {
    return isNoteInScope(noteMetadata, filterScope);
  }

  // Memory History & Versioning
  getMemoryHistory(memoryId, options) {
    return getMemoryHistory(this.vaultDir, memoryId, options);
  }

  async restoreMemory(memoryId, targetVersion, options) {
    return await restoreMemory(this.vaultDir, memoryId, targetVersion, options);
  }
}

module.exports = Brain;
