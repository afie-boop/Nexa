const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./properties");
const { isNoteInScope } = require("./memory_scope");

const DURABLE_TYPES = new Set(["preference","fact","goal","project","knowledge","instruction"]);

function inspectMemoryHealth(vaultDir, options = {}) {
  if (!vaultDir || !fs.existsSync(vaultDir)) return { total: 0, stale: [], weak: [], duplicates: [] };
  const scope = options.scope !== undefined ? options.scope : null;
  const staleDays = typeof options.staleDays === "number" ? options.staleDays : 180;
  const notes = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(vaultDir, full).replace(/\\/g, "/");
      if (rel.startsWith("Memory/History/") || rel.startsWith(".index/")) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const parsed = parseFrontmatter(fs.readFileSync(full, "utf8"));
          if (!isNoteInScope(parsed.frontmatter, scope)) continue;
          const fm = parsed.frontmatter || {};
          const updated = Date.parse(fm.updated || fm.created);
          const ageDays = Number.isFinite(updated) ? Math.max(0, (Date.now() - updated) / 86400000) : Infinity;
          notes.push({ path: rel, body: parsed.body.trim(), type: String(fm.type || "fact").toLowerCase(), confidence: Number(fm.confidence) || 0, importance: Number(fm.importance) || 0, ageDays });
        } catch {}
      }
    }
  }
  walk(path.resolve(vaultDir));
  const duplicateMap = new Map();
  for (const note of notes) {
    const key = note.body.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) continue;
    if (!duplicateMap.has(key)) duplicateMap.set(key, []);
    duplicateMap.get(key).push(note.path);
  }
  const duplicates = Array.from(duplicateMap.entries()).filter(([, paths]) => paths.length > 1).map(([content, paths]) => ({ content, paths }));
  return {
    total: notes.length,
    stale: notes.filter(n => n.ageDays >= staleDays),
    weak: notes.filter(n => !DURABLE_TYPES.has(n.type) || n.confidence < 0.5),
    duplicates
  };
}

module.exports = { inspectMemoryHealth };
