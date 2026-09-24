const fs = require('fs');
const path = require('path');
const { parseFrontmatter, getNoteTags } = require('./properties');

/**
 * Searches markdown notes in vault directory with relevance scoring and snippet generation.
 *
 * @param {string} vaultDir Path to vault root directory
 * @param {string} query Search query string (can contain multiple terms)
 * @returns {Array<{ name: string, path: string, score: number, matchedFields: string[], snippet: string }>}
 */
function searchNotes(vaultDir, query) {
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

  // Split query into terms, filtering out empty strings
  const terms = cleanQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const mdFiles = getAllMdFiles(absoluteVault, absoluteVault);
  const resultsMap = new Map();

  for (const filePath of mdFiles) {
    try {
      const relativePath = path.relative(absoluteVault, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);
      const tags = getNoteTags(content);

      const fileNameWithoutExt = path.basename(filePath, '.md');
      const title = frontmatter.title ? String(frontmatter.title) : fileNameWithoutExt;

      let score = 0;
      const matchedFieldsSet = new Set();
      let firstMatchIndex = -1;
      let firstMatchTerm = '';

      for (const term of terms) {
        let termMatched = false;

        // 1. Title match (Weight: 10 per match)
        if (title.toLowerCase().includes(term)) {
          score += 10;
          matchedFieldsSet.add('title');
          termMatched = true;
        }

        // 2. Tag match (Weight: 8 per match)
        const tagMatches = tags.filter(t => t.toLowerCase().includes(term));
        if (tagMatches.length > 0) {
          score += 8 * tagMatches.length;
          matchedFieldsSet.add('tags');
          termMatched = true;
        }

        // 3. Path match (Weight: 5 per match)
        if (relativePath.toLowerCase().includes(term)) {
          score += 5;
          matchedFieldsSet.add('path');
          termMatched = true;
        }

        // 4. Properties/Frontmatter match (Weight: 4 per match)
        let propertyMatched = false;
        for (const [key, val] of Object.entries(frontmatter)) {
          if (key === 'title' || key === 'tags') continue; // Handled separately
          const strVal = String(val).toLowerCase();
          if (strVal.includes(term)) {
            score += 4;
            propertyMatched = true;
          }
        }
        if (propertyMatched) {
          matchedFieldsSet.add('properties');
          termMatched = true;
        }

        // 5. Body/Content match (Weight: 2 per match)
        const lowerBody = body.toLowerCase();
        const bodyMatchesCount = countOccurrences(lowerBody, term);
        if (bodyMatchesCount > 0) {
          score += 2 * bodyMatchesCount;
          matchedFieldsSet.add('content');
          termMatched = true;

          // Track first match position in body for snippet generation
          if (firstMatchIndex === -1) {
            firstMatchIndex = lowerBody.indexOf(term);
            firstMatchTerm = term;
          }
        }
      }

      // If at least one term matched, record the result
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

  // Convert map to array and sort descending by score
  const results = Array.from(resultsMap.values());
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Counts occurrences of subStr in str (case-insensitive search).
 */
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

/**
 * Generates short content snippet around match position.
 */
function generateSnippet(body, matchIndex, matchTerm) {
  if (!body || typeof body !== 'string') {
    return '';
  }

  if (matchIndex === -1) {
    // Return first 80 characters of body if no body match position
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
  searchNotes
};
