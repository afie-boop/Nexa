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
  findExistingMemory,
  saveMemory,
  updateMemory
};
