const fs = require('fs');
const path = require('path');

/**
 * Parses all WikiLinks from text content.
 * Supports:
 * - [[Nama Note]]
 * - [[Folder/Nama Note]]
 * - [[Nama Note|Alias]]
 *
 * @param {string} content
 * @returns {Array<{ target: string, alias: string, raw: string }>}
 */
function parseWikiLinks(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const wikiLinkRegex = /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g;
  const links = [];
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const raw = match[0];
    const target = match[1].trim();
    const alias = match[2] ? match[2].trim() : target;

    if (target) {
      links.push({ target, alias, raw });
    }
  }

  return links;
}

/**
 * Extracts unique outgoing target notes from content.
 * Avoids duplicate targets.
 *
 * @param {string} content
 * @returns {string[]} Array of unique target note names/paths
 */
function getOutgoingLinks(content) {
  const links = parseWikiLinks(content);
  const targets = links.map(link => link.target);
  return Array.from(new Set(targets));
}

/**
 * Safely resolves a note path within the vault, enforcing path traversal security.
 *
 * @param {string} vaultDir Root path of the vault
 * @param {string} targetNote Target note path or name (e.g. "Nama Note", "Folder/Nama Note")
 * @returns {string} Absolute resolved file path
 * @throws {Error} If path traversal outside vault is detected
 */
function resolveNotePath(vaultDir, targetNote) {
  if (!vaultDir || !targetNote) {
    throw new Error('vaultDir and targetNote are required');
  }

  const absoluteVault = path.resolve(vaultDir);
  let cleanTarget = targetNote.trim();

  if (!cleanTarget.endsWith('.md')) {
    cleanTarget += '.md';
  }

  // Calculate candidate path
  const candidatePath = path.resolve(absoluteVault, cleanTarget);

  // Security Check: Path Traversal Prevention
  if (!candidatePath.startsWith(absoluteVault + path.sep) && candidatePath !== absoluteVault) {
    throw new Error(`Security Violation: Path traversal detected for "${targetNote}"`);
  }

  // If candidate file exists, return it
  if (fs.existsSync(candidatePath)) {
    return candidatePath;
  }

  // Fallback: search for note by filename inside vault if folder path not exact
  const targetFileName = path.basename(cleanTarget).toLowerCase();
  const found = findFileByBasename(absoluteVault, targetFileName, absoluteVault);
  if (found) {
    return found;
  }

  return candidatePath;
}

/**
 * Helper to recursively search for a file by basename within vault boundaries.
 */
function findFileByBasename(dir, targetBasename, absoluteVault) {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Ensure stay inside vault
    if (!fullPath.startsWith(absoluteVault + path.sep) && fullPath !== absoluteVault) {
      continue;
    }

    if (entry.isDirectory()) {
      const res = findFileByBasename(fullPath, targetBasename, absoluteVault);
      if (res) return res;
    } else if (entry.isFile() && entry.name.toLowerCase() === targetBasename) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Recursively scans all .md files in vault and retrieves backlinks for a target note.
 *
 * @param {string} vaultDir Root path of the vault
 * @param {string} targetNote Target note path or name to find backlinks for
 * @returns {Array<{ sourcePath: string, relativePath: string, link: { target: string, alias: string, raw: string } }>}
 */
function getBacklinks(vaultDir, targetNote) {
  if (!vaultDir || !targetNote) {
    return [];
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return [];
  }

  let resolvedTarget;
  try {
    resolvedTarget = resolveNotePath(absoluteVault, targetNote);
  } catch (err) {
    // If security error or invalid target, return empty
    return [];
  }

  const targetBasename = path.basename(resolvedTarget, '.md').toLowerCase();
  const allMdFiles = getAllMdFiles(absoluteVault, absoluteVault);
  const backlinksMap = new Map();

  for (const filePath of allMdFiles) {
    // Don't count self-referential backlinks as incoming backlinks if same file
    if (filePath === resolvedTarget) {
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const wikiLinks = parseWikiLinks(content);

      for (const link of wikiLinks) {
        let isMatch = false;

        try {
          const resolvedLinkPath = resolveNotePath(absoluteVault, link.target);
          if (resolvedLinkPath === resolvedTarget) {
            isMatch = true;
          }
        } catch (e) {
          // Ignore invalid link paths
        }

        // Also check direct target name match
        const linkTargetBasename = path.basename(link.target, '.md').toLowerCase();
        if (linkTargetBasename === targetBasename) {
          isMatch = true;
        }

        if (isMatch) {
          const relativePath = path.relative(absoluteVault, filePath);
          // Key by source relative path to prevent duplicate source entries if multiple links exist in same file
          if (!backlinksMap.has(relativePath)) {
            backlinksMap.set(relativePath, {
              sourcePath: filePath,
              relativePath,
              link
            });
          }
        }
      }
    } catch (readErr) {
      // Ignore unreadable files
    }
  }

  return Array.from(backlinksMap.values());
}

/**
 * Helper to get all .md files in directory recursively.
 */
function getAllMdFiles(dir, absoluteVault) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

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
  parseWikiLinks,
  getOutgoingLinks,
  resolveNotePath,
  getBacklinks
};
