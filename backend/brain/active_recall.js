const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./properties");
const { isNoteInScope } = require("./memory_scope");

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9_\-\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(text) {
  return new Set(normalize(text).split(" ").filter(t => t.length >= 3));
}

function lexicalRelevance(query, content) {
  const q = tokenSet(query);
  const c = tokenSet(content);
  if (!q.size || !c.size) return 0;
  let hits = 0;
  for (const token of q) if (c.has(token)) hits++;
  return hits / q.size;
}

function recencyScore(value) {
  if (!value) return 0.5;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 0.5;
  const ageDays = Math.max(0, (Date.now() - time) / 86400000);
  return Math.exp(-ageDays / 90);
}

function recallMemories(vaultDir, query, sources, options = {}) {
  if (!vaultDir || !Array.isArray(sources) || !sources.length) return [];
  const absoluteVault = path.resolve(vaultDir);
  const scope = options.scope !== undefined ? options.scope : null;
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 5;
  const scored = [];

  for (const source of sources) {
    if (!source || typeof source.path !== "string") continue;
    const fullPath = path.resolve(absoluteVault, source.path);
    if (!fullPath.startsWith(absoluteVault + path.sep) || !fs.existsSync(fullPath)) continue;

    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      const parsed = parseFrontmatter(raw);
      if (!isNoteInScope(parsed.frontmatter, scope)) continue;

      const fm = parsed.frontmatter || {};
      const lexical = lexicalRelevance(query, parsed.body);
      const base = Number(source.score) || 0;
      const semantic = Math.min(1, Math.max(0, base / 10));
      const confidence = Math.min(1, Math.max(0, Number(fm.confidence) || 0));
      const importance = Math.min(1, Math.max(0, Number(fm.importance) || 0));
      const durability = Math.min(1, Math.max(0, Number(fm.durability) || 0.5));
      const recency = recencyScore(fm.updated || fm.created);

      const recallScore =
        semantic * 0.30 +
        lexical * 0.25 +
        confidence * 0.15 +
        importance * 0.15 +
        durability * 0.10 +
        recency * 0.05;

      scored.push({
        ...source,
        recallScore: Number(recallScore.toFixed(4)),
        recallSignals: { semantic, lexical, confidence, importance, durability, recency }
      });
    } catch {}
  }

  return scored.sort((a, b) => b.recallScore - a.recallScore).slice(0, limit);
}

function buildRecallContext(query, memories, maxChars = 2500) {
  let text = "=== ACTIVE RECALL ===\nQuery: " + query + "\n";
  for (const [index, memory] of memories.entries()) {
    const block = "\n[RECALL " + (index + 1) + ": " + memory.path + "]\n" + (memory.snippet || "") + "\n";
    if (text.length + block.length > maxChars) break;
    text += block;
  }
  return text;
}

module.exports = { normalize, lexicalRelevance, recencyScore, recallMemories, buildRecallContext };
