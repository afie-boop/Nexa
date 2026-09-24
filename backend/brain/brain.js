const fs = require("fs");
const path = require("path");

const VAULT_ROOT = path.join(__dirname, "vault");

function ensureVault() {
  fs.mkdirSync(VAULT_ROOT, { recursive: true });
}

function safePath(relativePath) {
  const cleanPath = relativePath.replace(/\\/g, "/");

  if (cleanPath.includes("..")) {
    throw new Error("Invalid brain path");
  }

  return path.join(VAULT_ROOT, cleanPath);
}

function writeNote(relativePath, content) {
  ensureVault();

  if (!relativePath.endsWith(".md")) {
    relativePath += ".md";
  }

  const filePath = safePath(relativePath);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");

  return filePath;
}

function readNote(relativePath) {
  if (!relativePath.endsWith(".md")) {
    relativePath += ".md";
  }

  const filePath = safePath(relativePath);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

function listNotes(dir = "") {
  const basePath = safePath(dir);

  if (!fs.existsSync(basePath)) {
    return [];
  }

  const results = [];

  function scan(currentPath) {
    for (const item of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const fullPath = path.join(currentPath, item.name);

      if (item.isDirectory()) {
        scan(fullPath);
      } else if (item.name.endsWith(".md")) {
        results.push(path.relative(VAULT_ROOT, fullPath));
      }
    }
  }

  scan(basePath);

  return results;
}

function searchNotes(query, limit = 10) {
  const notes = listNotes();
  const search = query.toLowerCase();
  const results = [];

  for (const note of notes) {
    const content = readNote(note);

    if (content && content.toLowerCase().includes(search)) {
      results.push({
        path: note,
        content
      });
    }

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

module.exports = {
  VAULT_ROOT,
  writeNote,
  readNote,
  listNotes,
  searchNotes
};
