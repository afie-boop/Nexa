const fs = require('fs');
const path = require('path');
const { parseFrontmatter, getNoteTags } = require('./properties');
const { parseWikiLinks } = require('./wikilinks');
const { isExcludedVaultPath } = require('./vault_utils');

/**
 * Obsidian-compatible Markdown helpers.
 *
 * AXMchat Brain already stores notes as ordinary Markdown with YAML
 * frontmatter, tags, and WikiLinks. This module keeps that format
 * compatible with a normal Obsidian vault without requiring Obsidian.
 */

function normalizeWikiLink(target, alias = null) {
  if (typeof target !== 'string' || !target.trim()) {
    throw new Error('WikiLink target is required.');
  }

  const cleanTarget = target.trim().replace(/\\/g, '/');
  if (cleanTarget.includes('..') || cleanTarget.startsWith('/')) {
    throw new Error('Security Violation: invalid WikiLink target.');
  }

  const cleanAlias = typeof alias === 'string' && alias.trim()
    ? alias.trim()
    : null;

  return cleanAlias
    ? `[[${cleanTarget}|${cleanAlias}]]`
    : `[[${cleanTarget}]]`;
}

function getNoteCompatibility(vaultDir, relativePath) {
  if (!vaultDir || !relativePath) {
    throw new Error('vaultDir and relativePath are required.');
  }

  const absoluteVault = path.resolve(vaultDir);
  const cleanRelative = String(relativePath).replace(/\\/g, '/');

  if (
    cleanRelative.includes('..') ||
    path.isAbsolute(cleanRelative) ||
    isExcludedVaultPath(cleanRelative) ||
    !cleanRelative.toLowerCase().endsWith('.md')
  ) {
    throw new Error('Invalid or excluded Obsidian note path.');
  }

  const fullPath = path.resolve(absoluteVault, cleanRelative);
  if (!fullPath.startsWith(absoluteVault + path.sep)) {
    throw new Error('Security Violation: note path escapes vault.');
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error('Obsidian note not found.');
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  const wikiLinks = parseWikiLinks(content);
  const tags = getNoteTags(content);

  return {
    path: cleanRelative,
    title: frontmatter.title || path.basename(cleanRelative, '.md'),
    frontmatter,
    tags,
    wikiLinks,
    body
  };
}

function scanVaultCompatibility(vaultDir) {
  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return {
      compatible: false,
      noteCount: 0,
      notes: [],
      issues: ['Vault directory does not exist.']
    };
  }

  const notes = [];
  const issues = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(absoluteVault, fullPath).replace(/\\/g, '/');

      if (isExcludedVaultPath(relativePath)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;

      try {
        const info = getNoteCompatibility(absoluteVault, relativePath);
        notes.push({
          path: info.path,
          title: info.title,
          hasFrontmatter: Object.keys(info.frontmatter).length > 0,
          tagCount: info.tags.length,
          wikiLinkCount: info.wikiLinks.length
        });
      } catch (error) {
        issues.push(`${relativePath}: ${error.message}`);
      }
    }
  }

  walk(absoluteVault);

  return {
    compatible: issues.length === 0,
    noteCount: notes.length,
    notes,
    issues
  };
}

module.exports = {
  normalizeWikiLink,
  getNoteCompatibility,
  scanVaultCompatibility
};
