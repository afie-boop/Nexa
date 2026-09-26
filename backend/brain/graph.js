const fs = require('fs');
const path = require('path');
const { parseWikiLinks, resolveNotePath } = require('./wikilinks');
const { parseFrontmatter, getNoteTags } = require('./properties');
const { isExcludedVaultPath } = require('./vault_utils');
const { isNoteInScope } = require('./memory_scope');

/**
 * Builds a network graph of nodes and edges from all markdown files in the vault.
 * Excludes Memory/History snapshots.
 *
 * @param {string} vaultDir Path to the vault root directory
 * @returns {{ nodes: Array<{ id: string, path: string, name: string, tags: string[], frontmatter: Record<string, any> }>, edges: Array<{ source: string, target: string }> }}
 */
function buildGraph(vaultDir, options = {}) {
  if (!vaultDir) {
    return { nodes: [], edges: [] };
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return { nodes: [], edges: [] };
  }

  const mdFiles = getAllMdFiles(absoluteVault, absoluteVault, options.scope);
  const nodesMap = new Map();
  const filePathToIdMap = new Map();

  // Step 1: Generate Nodes
  for (const filePath of mdFiles) {
    try {
      const relativePath = path.relative(absoluteVault, filePath).replace(/\\/g, '/');

      if (isExcludedVaultPath(relativePath)) {
        continue;
      }

      const nodeId = relativePath;
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);
      if (options.scope !== undefined && !isNoteInScope(frontmatter, options.scope)) continue;
      const tags = getNoteTags(content);

      const fileNameWithoutExt = path.basename(filePath, '.md');
      const name = frontmatter.title || fileNameWithoutExt;

      const node = {
        id: nodeId,
        path: relativePath,
        name,
        tags,
        frontmatter
      };

      nodesMap.set(nodeId, node);
      filePathToIdMap.set(filePath, nodeId);
    } catch (err) {
      // Ignore unreadable files
    }
  }

  const nodes = Array.from(nodesMap.values());
  const edgesSet = new Set();
  const edges = [];

  // Step 2: Generate Edges based on WikiLinks
  for (const filePath of mdFiles) {
    const sourceId = filePathToIdMap.get(filePath);
    if (!sourceId) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const wikiLinks = parseWikiLinks(content);

      for (const link of wikiLinks) {
        try {
          const resolvedPath = resolveNotePath(absoluteVault, link.target, { scope: options.scope });
          const targetId = filePathToIdMap.get(resolvedPath);

          if (targetId) {
            if (sourceId === targetId) {
              continue;
            }

            const edgeKey = `${sourceId}->${targetId}`;
            if (!edgesSet.has(edgeKey)) {
              edgesSet.add(edgeKey);
              edges.push({
                source: sourceId,
                target: targetId
              });
            }
          }
        } catch (e) {
          // Skip invalid links
        }
      }
    } catch (readErr) {
      // Ignore
    }
  }

  return {
    nodes,
    edges
  };
}

function getAllMdFiles(dir, absoluteVault, scope) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (!fullPath.startsWith(absoluteVault + path.sep) && fullPath !== absoluteVault) {
      continue;
    }

    const relPath = path.relative(absoluteVault, fullPath).replace(/\\/g, '/');
    if (isExcludedVaultPath(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      results = results.concat(getAllMdFiles(fullPath, absoluteVault, scope));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (scope !== undefined) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const { frontmatter } = parseFrontmatter(raw);
          if (!isNoteInScope(frontmatter, scope)) continue;
        } catch (_) { continue; }
      }
      results.push(fullPath);
    }
  }
  return results;
}

module.exports = {
  buildGraph
};
