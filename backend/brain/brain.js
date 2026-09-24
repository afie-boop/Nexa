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

  getBacklinks(targetNote) {
    return getBacklinks(this.vaultDir, targetNote);
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
  buildGraph() {
    return buildGraph(this.vaultDir);
  }

  // Full-Text Search
  searchNotes(query) {
    return searchNotes(this.vaultDir, query);
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
}

module.exports = Brain;
