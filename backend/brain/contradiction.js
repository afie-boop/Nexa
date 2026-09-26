const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./properties");
const { isNoteInScope } = require("./memory_scope");

function normalize(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getContradictionKey(content, type) {
  const text = normalize(content);

  if (/^(user:\s*)?(nama saya|my name is)\b/i.test(text)) return "identity:name";
  if (/^(user:\s*)?(umur saya|my age is|i am \d{1,3}\b)/i.test(text)) return "identity:age";
  if (/\b(saya suka|i like|i prefer|favorite|favourite|saya tidak suka|i don't like|i hate|benci)\b/i.test(text)) {
    const subject = text
      .replace(/^(user:\s*)?/i, "")
      .replace(/^(saya suka|saya tidak suka|i like|i prefer|i don't like|i hate|benci|favorite|favourite)\s+/i, "")
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
    return subject ? `preference:${subject}` : "preference:generic";
  }
  if (/\b(saya mahu|i want to|matlamat|goal|target|impian)\b/i.test(text)) return "goal:general";

  return `${type || "fact"}:${text.split(/\s+/).slice(0, 5).join(" ")}`;
}

function findContradiction(brain, memory, scope) {
  if (!brain?.vaultDir || !memory?.content) return null;

  const key = getContradictionKey(memory.content, memory.type);
  const files = [];
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(brain.vaultDir, full).replace(/\\/g, "/");
      if (rel.startsWith("Memory/History") || rel.startsWith(".index")) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
    }
  };
  walk(brain.vaultDir);

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = parseFrontmatter(raw);
      if (!isNoteInScope(parsed.frontmatter, scope)) continue;
      const existingKey = getContradictionKey(parsed.body, parsed.frontmatter.type);
      if (existingKey !== key) continue;
      if (normalize(parsed.body) === normalize(memory.content)) continue;

      return {
        path: path.relative(brain.vaultDir, file).replace(/\\/g, "/"),
        frontmatter: parsed.frontmatter,
        content: parsed.body
      };
    } catch {
      // Ignore unreadable notes.
    }
  }

  return null;
}

module.exports = { getContradictionKey, findContradiction };
