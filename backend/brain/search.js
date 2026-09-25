const fs = require('fs');
const path = require('path');
const { parseFrontmatter, getNoteTags } = require('./properties');
const { isNoteInScope } = require('./memory_scope');

/**
 * Searches markdown notes in vault directory with relevance scoring and snippet generation.
 * Excludes Memory/History directory.
 *
 * @param {string} vaultDir Path to vault root directory
 * @param {string} query Search query string
 * @param {object} [options] Options including `scope` filter
 * @returns {Array<{ name: string, path: string, score: number, matchedFields: string[], snippet: string }>}
 */
function searchNotes(vaultDir, query, options = {}) {
  if (!vaultDir || !query || typeof query !== 'string') {
    return [];
  }

  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return [];
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return [];
  }

  const terms = cleanQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const filterScope = options.scope !== undefined ? options.scope : null;

  const mdFiles = getAllMdFiles(absoluteVault, absoluteVault);
  const resultsMap = new Map();

  for (const filePath of mdFiles) {
    try {
      const relativePath = path.relative(absoluteVault, filePath).replace(/\\/g, '/');

      // Exclude historical snapshots from ordinary search
      if (relativePath.startsWith('Memory/History/')) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);

      // Scope Isolation Check
      if (!isNoteInScope(frontmatter, filterScope)) {
        continue;
      }

      const tags = getNoteTags(content);
      const fileNameWithoutExt = path.basename(filePath, '.md');
      const title = frontmatter.title ? String(frontmatter.title) : fileNameWithoutExt;

      let score = 0;
      const matchedFieldsSet = new Set();
      let firstMatchIndex = -1;
      let firstMatchTerm = '';

      for (const term of terms) {
        if (title.toLowerCase().includes(term)) {
          score += 10;
          matchedFieldsSet.add('title');
        }

        const tagMatches = tags.filter(t => t.toLowerCase().includes(term));
        if (tagMatches.length > 0) {
          score += 8 * tagMatches.length;
          matchedFieldsSet.add('tags');
        }

        if (relativePath.toLowerCase().includes(term)) {
          score += 5;
          matchedFieldsSet.add('path');
        }

        let propertyMatched = false;
        for (const [key, val] of Object.entries(frontmatter)) {
          if (key === 'title' || key === 'tags' || key.startsWith('scope') || key.endsWith('Id')) continue;
          const strVal = String(val).toLowerCase();
          if (strVal.includes(term)) {
            score += 4;
            propertyMatched = true;
          }
        }
        if (propertyMatched) {
          matchedFieldsSet.add('properties');
        }

        const lowerBody = body.toLowerCase();
        const bodyMatchesCount = countOccurrences(lowerBody, term);
        if (bodyMatchesCount > 0) {
          score += 2 * bodyMatchesCount;
          matchedFieldsSet.add('content');

          if (firstMatchIndex === -1) {
            firstMatchIndex = lowerBody.indexOf(term);
            firstMatchTerm = term;
          }
        }
      }

      if (score > 0) {
        const snippet = generateSnippet(body, firstMatchIndex, firstMatchTerm);
        resultsMap.set(relativePath, {
          name: title,
          path: relativePath,
          score,
          matchedFields: Array.from(matchedFieldsSet),
          snippet
        });
      }
    } catch (err) {
      // Ignore unreadable files
    }
  }

  const results = Array.from(resultsMap.values());
  results.sort((a, b) => b.score - a.score);

  return results;
}

function countOccurrences(str, subStr) {
  if (!str || !subStr) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(subStr, pos)) !== -1) {
    count++;
    pos += subStr.length;
  }
  return count;
}

function generateSnippet(body, matchIndex, matchTerm) {
  if (!body || typeof body !== 'string') {
    return '';
  }

  if (matchIndex === -1) {
    const cleanBody = body.replace(/\s+/g, ' ').trim();
    return cleanBody.length > 80 ? cleanBody.substring(0, 80) + '...' : cleanBody;
  }

  const start = Math.max(0, matchIndex - 30);
  const end = Math.min(body.length, matchIndex + matchTerm.length + 50);

  let snippet = body.substring(start, end).replace(/\r?\n|\r/g, ' ').trim();

  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < body.length) {
    snippet = snippet + '...';
  }

  return snippet;
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
  searchNotes
};
