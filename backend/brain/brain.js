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
}

module.exports = Brain;
