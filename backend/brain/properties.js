const fs = require('fs');
const path = require('path');

/**
 * Simple YAML Frontmatter Parser (no external dependency needed).
 * Parses key-value pairs between leading `---` and `---` blocks.
 *
 * @param {string} content
 * @returns {{ frontmatter: Record<string, any>, body: string }}
 */
function parseFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { frontmatter: {}, body: '' };
  }

  const normalized = content.trimStart();
  if (!normalized.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }

  // Find closing ---
  const closingIndex = normalized.indexOf('\n---', 3);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlBlock = normalized.substring(3, closingIndex).trim();
  const body = normalized.substring(closingIndex + 4).trimStart();
  const frontmatter = {};

  const lines = yamlBlock.split('\n');
  let currentKey = null;

  for (let line of lines) {
    const rawLine = line;
    line = line.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    // List item under key
    if (line.startsWith('-') && currentKey) {
      const val = line.substring(1).trim().replace(/^['"]|['"]$/g, '');
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      if (val) {
        frontmatter[currentKey].push(val);
      }
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim();
      let val = line.substring(colonIdx + 1).trim();
      currentKey = key;

      if (!val) {
        // Key with empty value or upcoming list
        frontmatter[key] = [];
        continue;
      }

      // Inline array e.g. [tag1, tag2] or ["#tag1", "#tag2"]
      if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.substring(1, val.length - 1).trim();
        if (inner) {
          frontmatter[key] = inner
            .split(',')
            .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        } else {
          frontmatter[key] = [];
        }
      } else {
        // String or boolean / date value
        const cleanVal = val.replace(/^['"]|['"]$/g, '');
        frontmatter[key] = cleanVal;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Extracts inline hashtag tags from text content (e.g., #axmchat, #project/web, #memory).
 * Excludes headers or hexadecimal colors where applicable.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseInlineTags(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Regex for hashtags like #tag, #project/sub, #axmchat
  // Must be preceded by whitespace, start of line, or punctuation, and not be purely digits
  const hashtagRegex = /(?:^|\s)#([a-zA-Z0-9_\/-]+)/g;
  const tags = [];
  let match;

  while ((match = hashtagRegex.exec(text)) !== null) {
    const rawTag = match[1].trim();
    // Ignore pure numbers (e.g. #123) or hex colors (like #FFF)
    if (rawTag && !/^\d+$/.test(rawTag)) {
      const formatted = rawTag.startsWith('#') ? rawTag : `#${rawTag}`;
      tags.push(formatted.toLowerCase());
    }
  }

  return Array.from(new Set(tags));
}

/**
 * Reads all tags from a note content (combining frontmatter tags and inline tags).
 * Eliminates duplicates and normalizes tags to start with `#`.
 *
 * @param {string} content
 * @returns {string[]} Unique array of tags starting with `#`
 */
function getNoteTags(content) {
  const { frontmatter, body } = parseFrontmatter(content);
  const tagSet = new Set();

  // Process YAML frontmatter tags
  if (frontmatter.tags) {
    let rawYamlTags = [];
    if (Array.isArray(frontmatter.tags)) {
      rawYamlTags = frontmatter.tags;
    } else if (typeof frontmatter.tags === 'string') {
      rawYamlTags = frontmatter.tags.split(/[\s,]+/);
    }

    for (const t of rawYamlTags) {
      if (!t) continue;
      const clean = String(t).trim();
      if (clean) {
        const formatted = clean.startsWith('#') ? clean : `#${clean}`;
        tagSet.add(formatted.toLowerCase());
      }
    }
  }

  // Process inline tags from body
  const inline = parseInlineTags(body);
  for (const t of inline) {
    tagSet.add(t.toLowerCase());
  }

  return Array.from(tagSet);
}

/**
 * Recursively scans vault notes and returns all notes matching a given tag.
 * Maintains path traversal security.
 *
 * @param {string} vaultDir
 * @param {string} targetTag Tag to search for (e.g. "#axmchat" or "axmchat")
 * @returns {Array<{ sourcePath: string, relativePath: string, tags: string[], frontmatter: Record<string, any> }>}
 */
function findNotesByTag(vaultDir, targetTag) {
  if (!vaultDir || !targetTag) {
    return [];
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return [];
  }

  const cleanTarget = targetTag.trim().startsWith('#')
    ? targetTag.trim().toLowerCase()
    : `#${targetTag.trim().toLowerCase()}`;

  const allFiles = getAllMdFiles(absoluteVault, absoluteVault);
  const matchedNotes = [];

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);
      const tags = getNoteTags(content);

      if (tags.includes(cleanTarget)) {
        const relativePath = path.relative(absoluteVault, filePath);
        matchedNotes.push({
          sourcePath: filePath,
          relativePath,
          tags,
          frontmatter
        });
      }
    } catch (err) {
      // Ignore unreadable files
    }
  }

  return matchedNotes;
}

/**
 * Safe directory traversal helper stays within vault boundaries.
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
  parseFrontmatter,
  parseInlineTags,
  getNoteTags,
  findNotesByTag
};
