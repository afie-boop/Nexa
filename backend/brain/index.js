const Brain = require('./brain');
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

module.exports = {
  Brain,
  parseWikiLinks,
  getOutgoingLinks,
  resolveNotePath,
  getBacklinks,
  parseFrontmatter,
  parseInlineTags,
  getNoteTags,
  findNotesByTag,
  buildGraph,
  searchNotes,
  cosineSimilarity,
  createEmbedding,
  createEmbeddings,
  semanticSearch,
  retrieveContext,
  extractMemory,
  extractMemoryWithAI,
  findExistingMemory,
  saveMemory,
  updateMemory,
  sanitizeScopeId,
  normalizeScope,
  getScopeDirectory,
  isNoteInScope,
  getMemoryHistory,
  restoreMemory
};
