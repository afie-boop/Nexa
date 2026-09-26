const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./properties");
const { isNoteInScope } = require("./memory_scope");

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9_\-\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(text) {
  return new Set(normalizeText(text).split(" ").filter(token => token.length >= 3));
}

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / Math.max(1, Math.min(left.size, right.size));
}

function getAllNotes(vaultDir) {
  const absoluteVault = path.resolve(vaultDir);
  const notes = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(absoluteVault, full).replace(/\\/g, "/");
      if (rel.startsWith("Memory/History/") || rel.startsWith(".index/")) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const parsed = parseFrontmatter(fs.readFileSync(full, "utf8"));
          notes.push({ path: rel, ...parsed });
        } catch {}
      }
    }
  }

  walk(absoluteVault);
  return notes;
}

function findConsolidationGroups(vaultDir, options = {}) {
  if (!vaultDir) return [];
  const scope = options.scope !== undefined ? options.scope : null;
  const threshold = typeof options.threshold === "number" ? options.threshold : 0.4;
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 20;

  const candidates = getAllNotes(vaultDir)
    .filter(note => isNoteInScope(note.frontmatter, scope))
    .filter(note => note.body && String(note.body).trim())
    .filter(note => !options.durableOnly || ["preference", "fact", "goal", "project", "knowledge", "instruction"].includes(String(note.frontmatter.type || "").toLowerCase()))
    .map(note => ({
      ...note,
      id: note.frontmatter.id || null,
      type: String(note.frontmatter.type || "fact").toLowerCase(),
      importance: Number(note.frontmatter.importance) || 0.7,
      confidence: Number(note.frontmatter.confidence) || 0.7,
      durability: Number(note.frontmatter.durability) || 0.7
    }));

  const groups = [];
  const used = new Set();

  for (const note of candidates) {
    if (used.has(note.path)) continue;
    const related = [note];
    used.add(note.path);

    for (const other of candidates) {
      if (used.has(other.path)) continue;
      if (note.type !== other.type && options.sameType !== false) continue;
      if (similarity(note.body, other.body) >= threshold) {
        related.push(other);
        used.add(other.path);
      }
    }

    if (related.length >= 2) {
      related.sort((a, b) => (b.importance + b.confidence) - (a.importance + a.confidence));
      groups.push({ canonical: related[0], members: related, similarityThreshold: threshold });
    }
    if (groups.length >= limit) break;
  }

  return groups;
}

function buildConsolidationUpdate(group) {
  if (!group || !group.canonical || !Array.isArray(group.members) || group.members.length < 2) return null;

  const canonical = group.canonical;
  const seen = new Set();
  const lines = [];

  for (const member of group.members) {
    const content = String(member.body || "").trim();
    const key = normalizeText(content);
    if (!content || seen.has(key)) continue;
    seen.add(key);
    lines.push("- " + content);
  }

  if (!lines.length) return null;

  return {
    canonicalPath: canonical.path,
    content: "Consolidated memory:\n" + lines.join("\n"),
    type: canonical.type,
    category: canonical.frontmatter.category || "memory",
    tags: Array.from(new Set(group.members.flatMap(member => Array.isArray(member.frontmatter.tags) ? member.frontmatter.tags : []))),
    importance: Math.max(...group.members.map(member => member.importance)),
    confidence: Math.max(...group.members.map(member => member.confidence)),
    durability: Math.max(...group.members.map(member => member.durability)),
    consolidatedFrom: group.members.map(member => member.path),
    memberIds: group.members.map(member => member.id).filter(Boolean)
  };
}

async function consolidateMemories(brain, options = {}) {
  if (!brain || !brain.vaultDir || typeof brain.updateMemory !== "function") {
    return { updated: [], skipped: "brain_unavailable" };
  }

  const groups = findConsolidationGroups(brain.vaultDir, {
    ...options,
    durableOnly: options.durableOnly !== false
  });

  const updated = [];
  for (const group of groups) {
    const update = buildConsolidationUpdate(group);
    if (!update) continue;

    try {
      const result = await brain.updateMemory(update.canonicalPath, update, { scope: options.scope });
      updated.push({ ...update, version: result.version, path: result.path });
    } catch (error) {
      updated.push({ canonicalPath: update.canonicalPath, error: error.message });
    }
  }

  return { updated, groups: groups.length };
}

module.exports = {
  normalizeText,
  similarity,
  findConsolidationGroups,
  buildConsolidationUpdate,
  consolidateMemories
};
