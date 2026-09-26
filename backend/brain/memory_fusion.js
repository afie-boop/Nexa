const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./properties");
const { isNoteInScope } = require("./memory_scope");

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9_\\-\\s]/g, " ").replace(/\\s+/g, " ").trim();
}

function tokenize(text) {
  return new Set(normalize(text).split(" ").filter(token => token.length >= 3));
}

function overlapScore(query, content) {
  const q = tokenize(query);
  const c = tokenize(content);
  if (!q.size || !c.size) return 0;
  let matches = 0;
  for (const token of q) if (c.has(token)) matches++;
  return matches / q.size;
}

function fuseMemories(vaultDir, query, sources = [], options = {}) {
  if (!vaultDir || !query || !Array.isArray(sources)) return [];
  const absoluteVault = path.resolve(vaultDir);
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 5;
  const scope = options.scope !== undefined ? options.scope : null;
  const candidates = sources.map(source => {
    const filePath = path.join(absoluteVault, source.path || "");
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
      if (!isNoteInScope(parsed.frontmatter, scope)) return null;
      const semanticScore = Number(source.score) || 0;
      const lexicalScore = overlapScore(query, parsed.body);
      const confidence = Math.max(0, Math.min(1, Number(parsed.frontmatter.confidence ?? 0.7)));
      const importance = Math.max(0, Math.min(1, Number(parsed.frontmatter.importance ?? 0.7)));
      const durability = Math.max(0, Math.min(1, Number(parsed.frontmatter.durability ?? 0.7)));
      const score = semanticScore * 0.45 + lexicalScore * 2 + confidence * 1.25 + importance + durability * 0.75;
      return { name: source.name, path: source.path, content: parsed.body.trim(), tags: Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [], type: parsed.frontmatter.type || "fact", score, sourceTypes: source.sourceTypes || [] };
    } catch { return null; }
  }).filter(Boolean);
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, limit);
  const groups = [];
  for (const candidate of selected) {
    const candidateTokens = tokenize(candidate.content);
    let group = null;
    for (const existing of groups) {
      const existingTokens = tokenize(existing.content);
      let common = 0;
      for (const token of candidateTokens) if (existingTokens.has(token)) common++;
      const similarity = common / Math.max(1, Math.min(candidateTokens.size, existingTokens.size));
      if (similarity >= 0.25) { group = existing; break; }
    }
    if (!group) groups.push({ content: candidate.content, paths: [candidate.path], types: [candidate.type], tags: [...candidate.tags], score: candidate.score });
    else { group.content += `\n${candidate.content}`; group.paths.push(candidate.path); group.types.push(candidate.type); group.tags.push(...candidate.tags); group.score = Math.max(group.score, candidate.score) + 0.15; }
  }
  return groups.map(group => ({ ...group, tags: [...new Set(group.tags)], types: [...new Set(group.types)], score: Number(group.score.toFixed(3)) }));
}

function buildFusedContext(query, groups, maxChars = 2500) {
  let output = `=== FUSED BRAIN MEMORY ===\nQuery: ${query}\n`;
  let remaining = maxChars - output.length;
  for (const group of groups) {
    if (remaining <= 100) break;
    const block = `\n[MEMORY GROUP]\n${group.content}\nSources: ${group.paths.join(", ")}\n`;
    if (block.length > remaining) { output += block.substring(0, Math.max(0, remaining - 3)) + "..."; break; }
    output += block; remaining -= block.length;
  }
  return output;
}

module.exports = { fuseMemories, buildFusedContext, overlapScore };