const fs = require('fs');
const path = require('path');
const { searchNotes } = require('./search');
const { semanticSearch } = require('./semantic');
const { parseWikiLinks, getBacklinks, resolveNotePath } = require('./wikilinks');
const { parseFrontmatter, getNoteTags } = require('./properties');
const { buildGraph } = require('./graph');

/**
 * Retrieves RAG context by combining hybrid search (Full-text + Semantic)
 * and expanding graph, wikilink, and backlink relationships.
 *
 * @param {string} vaultDir
 * @param {string} query
 * @param {object} [options]
 * @returns {Promise<{ query: string, results: Array<object>, context: string, sources: Array<object> }>}
 */
async function retrieveContext(vaultDir, query, options = {}) {
  const emptyResponse = {
    query: query || '',
    results: [],
    context: buildEmptyContextString(query || ''),
    sources: []
  };

  if (!vaultDir || !query || typeof query !== 'string') {
    return emptyResponse;
  }

  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return emptyResponse;
  }

  const absoluteVault = path.resolve(vaultDir);
  if (!fs.existsSync(absoluteVault)) {
    return emptyResponse;
  }

  // Options configuration
  const topK = typeof options.topK === 'number' && options.topK > 0 ? options.topK : 5;
  const maxSources = typeof options.maxSources === 'number' && options.maxSources > 0 ? options.maxSources : 10;
  const maxContextChars = typeof options.maxContextChars === 'number' && options.maxContextChars > 0 ? options.maxContextChars : 4000;
  const semanticThreshold = typeof options.semanticThreshold === 'number' ? options.semanticThreshold : 0.0;
  const graphLimit = typeof options.graphLimit === 'number' && options.graphLimit >= 0 ? options.graphLimit : 5;

  const sourcesMap = new Map(); // key: relativePath, value: source item

  // Helper to add or update source in map
  const addSource = (item) => {
    const key = item.path;
    if (!sourcesMap.has(key)) {
      sourcesMap.set(key, item);
    } else {
      const existing = sourcesMap.get(key);
      // Boost score if discovered through multiple channels
      existing.score = Math.max(existing.score, item.score) + 0.1;
      if (!existing.sourceTypes.includes(item.primarySourceType)) {
        existing.sourceTypes.push(item.primarySourceType);
      }
    }
  };

  // 1. Full-Text Search
  let fulltextResults = [];
  try {
    fulltextResults = searchNotes(absoluteVault, cleanQuery);
  } catch (err) {
    console.warn('Full-text Search Retrieval Warning:', err.message);
  }

  for (const ft of fulltextResults) {
    addSource({
      name: ft.name,
      path: ft.path,
      score: ft.score,
      snippet: ft.snippet,
      tags: [],
      primarySourceType: 'fulltext',
      sourceTypes: ['fulltext']
    });
  }

  // 2. Semantic Search (with graceful fallback if API key missing or error)
  let semanticResults = [];
  try {
    semanticResults = await semanticSearch(absoluteVault, cleanQuery, {
      topK,
      threshold: semanticThreshold,
      customEmbedder: options.customEmbedder
    });
  } catch (err) {
    console.warn('Semantic Search Retrieval Fallback (proceeding without vector results):', err.message);
  }

  for (const sem of semanticResults) {
    addSource({
      name: sem.name,
      path: sem.path,
      score: sem.score * 10, // Normalizing score range relative to full-text
      snippet: sem.snippet,
      tags: sem.matchedMetadata?.tags || [],
      primarySourceType: 'semantic',
      sourceTypes: ['semantic']
    });
  }

  // If no primary search results found, return empty response
  if (sourcesMap.size === 0) {
    return emptyResponse;
  }

  // Rank hybrid results
  let sortedPrimary = Array.from(sourcesMap.values()).sort((a, b) => b.score - a.score);
  const primaryTopK = sortedPrimary.slice(0, topK);

  // 3. Graph Relationships Expansion (buildGraph)
  if (graphLimit > 0) {
    try {
      const vaultGraph = buildGraph(absoluteVault);
      let graphAddedCount = 0;

      // Index edges for outgoing (source -> target) and incoming (target -> source)
      const graphAdjacency = new Map(); // nodeId -> Set of connected nodeIds

      for (const edge of vaultGraph.edges) {
        if (!graphAdjacency.has(edge.source)) {
          graphAdjacency.set(edge.source, new Set());
        }
        graphAdjacency.get(edge.source).add(edge.target);

        if (!graphAdjacency.has(edge.target)) {
          graphAdjacency.set(edge.target, new Set());
        }
        graphAdjacency.get(edge.target).add(edge.source);
      }

      // Map graph node IDs to graph nodes
      const graphNodesMap = new Map();
      for (const node of vaultGraph.nodes) {
        graphNodesMap.set(node.id, node);
      }

      for (const primaryItem of primaryTopK) {
        if (graphAddedCount >= graphLimit || sourcesMap.size >= maxSources) break;

        const primaryNodeId = primaryItem.path;
        const connectedNodes = graphAdjacency.get(primaryNodeId);

        if (connectedNodes) {
          for (const neighborId of connectedNodes) {
            if (graphAddedCount >= graphLimit || sourcesMap.size >= maxSources) break;

            const neighborNode = graphNodesMap.get(neighborId);
            if (!neighborNode) continue;

            const fullPath = path.join(absoluteVault, neighborNode.path);
            if (!fs.existsSync(fullPath)) continue;

            let snippet = '';
            try {
              const raw = fs.readFileSync(fullPath, 'utf-8');
              const { body } = parseFrontmatter(raw);
              snippet = body.substring(0, 150).replace(/\r?\n|\r/g, ' ').trim();
            } catch (e) {
              // Snippet fallback
            }

            const graphScore = primaryItem.score * 0.25;

            addSource({
              name: neighborNode.name,
              path: neighborNode.path,
              score: graphScore,
              snippet,
              tags: neighborNode.tags || [],
              primarySourceType: 'graph',
              sourceTypes: ['graph']
            });

            graphAddedCount++;
          }
        }
      }
    } catch (graphErr) {
      console.warn('Graph Retrieval Warning:', graphErr.message);
    }
  }

  // 4. Related Notes Expansion (WikiLinks, Backlinks)
  for (const primaryItem of primaryTopK) {
    const fullPath = path.join(absoluteVault, primaryItem.path);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Expand Outgoing WikiLinks
      const wikiLinks = parseWikiLinks(content);
      for (const link of wikiLinks) {
        try {
          const resolvedPath = resolveNotePath(absoluteVault, link.target);
          const relPath = path.relative(absoluteVault, resolvedPath).replace(/\\/g, '/');

          if (fs.existsSync(resolvedPath)) {
            const relContent = fs.readFileSync(resolvedPath, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(relContent);
            const tags = getNoteTags(relContent);
            const name = frontmatter.title || path.basename(resolvedPath, '.md');

            addSource({
              name,
              path: relPath,
              score: primaryItem.score * 0.5,
              snippet: body.substring(0, 150).replace(/\r?\n|\r/g, ' ').trim(),
              tags,
              primarySourceType: 'wikilink',
              sourceTypes: ['wikilink']
            });
          }
        } catch (linkErr) {
          // Skip invalid links
        }
      }

      // Expand Incoming Backlinks
      const backlinks = getBacklinks(absoluteVault, primaryItem.path);
      for (const bl of backlinks) {
        const relPath = bl.relativePath.replace(/\\/g, '/');
        if (fs.existsSync(bl.sourcePath)) {
          const blContent = fs.readFileSync(bl.sourcePath, 'utf-8');
          const { frontmatter, body } = parseFrontmatter(blContent);
          const tags = getNoteTags(blContent);
          const name = frontmatter.title || path.basename(bl.sourcePath, '.md');

          addSource({
            name,
            path: relPath,
            score: primaryItem.score * 0.4,
            snippet: body.substring(0, 150).replace(/\r?\n|\r/g, ' ').trim(),
            tags,
            primarySourceType: 'backlink',
            sourceTypes: ['backlink']
          });
        }
      }
    } catch (readErr) {
      // Ignore
    }
  }

  // 5. Final Sources Selection (Limited to maxSources)
  const finalSources = Array.from(sourcesMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSources);

  // Read full or snippet content for sources & Build Context
  const context = buildContextText(cleanQuery, finalSources, absoluteVault, maxContextChars);

  return {
    query: cleanQuery,
    results: finalSources.map(s => ({
      name: s.name,
      path: s.path,
      score: Number(s.score.toFixed(2)),
      sourceTypes: s.sourceTypes
    })),
    context,
    sources: finalSources.map(s => ({
      name: s.name,
      path: s.path,
      score: Number(s.score.toFixed(2)),
      sourceTypes: s.sourceTypes,
      tags: s.tags
    }))
  };
}

/**
 * Builds clean, structured context text for LLMs.
 */
function buildContextText(query, sources, absoluteVault, maxContextChars) {
  let header = `=== USER QUERY ===\n${query}\n\n=== RETRIEVED CONTEXT ===\n`;
  let footer = `\n=== SOURCES ===\n`;

  let currentLength = header.length + footer.length;
  let contextBlocks = [];
  let sourceLines = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    sourceLines.push(`- Source [${i + 1}]: ${src.path} (Types: ${src.sourceTypes.join(', ')})`);

    let noteContent = src.snippet;
    const fullPath = path.join(absoluteVault, src.path);
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const { body } = parseFrontmatter(raw);
        noteContent = body || src.snippet;
      } catch (e) {
        // Fallback to snippet
      }
    }

    const blockHeader = `\n[DOCUMENT ${i + 1}: ${src.name} (${src.path})]\n`;
    const blockText = `${blockHeader}${noteContent.trim()}\n`;

    if (currentLength + blockText.length > maxContextChars) {
      // Truncate cleanly if maxContextChars exceeded
      const allowedChars = maxContextChars - currentLength - blockHeader.length - 20;
      if (allowedChars > 50) {
        const truncatedBlock = `${blockHeader}${noteContent.substring(0, allowedChars).trim()}...\n`;
        contextBlocks.push(truncatedBlock);
      }
      break;
    }

    contextBlocks.push(blockText);
    currentLength += blockText.length;
  }

  footer += sourceLines.join('\n') + '\n';
  return header + contextBlocks.join('') + footer;
}

function buildEmptyContextString(query) {
  return `=== USER QUERY ===\n${query}\n\n=== RETRIEVED CONTEXT ===\nNo relevant context found in vault.\n\n=== SOURCES ===\nNone\n`;
}

module.exports = {
  retrieveContext
};
