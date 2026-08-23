const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "../../");

function resolveWorkspacePath(relativePath = "") {
  // Normalize and resolve absolute path
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);

  // Security check: path must stay within WORKSPACE_ROOT
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error(`Akses dinafikan: Laluan '${relativePath}' di luar kawasan kerja (workspace traversal prevented).`);
  }

  return resolved;
}

function getRelativeWorkspacePath(absPath) {
  return path.relative(WORKSPACE_ROOT, absPath);
}

const IGNORE_DIRS = new Set([".git", "node_modules", "dist", ".cache", "build"]);

function list_files(dirPath = "") {
  const targetDir = resolveWorkspacePath(dirPath);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Direktori '${dirPath}' tidak wujud.`);
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    throw new Error(`'${dirPath}' bukan direktori.`);
  }

  const results = [];

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      if (IGNORE_DIRS.has(item)) continue;

      const fullPath = path.join(currentDir, item);
      const relative = path.relative(WORKSPACE_ROOT, fullPath);
      let itemStat;
      try {
        itemStat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (itemStat.isDirectory()) {
        results.push(relative + "/");
        // Limit depth if listing recursively
        if (results.length < 500) {
          walk(fullPath);
        }
      } else {
        results.push(relative);
      }
    }
  }

  walk(targetDir);
  return results;
}

function read_file(filePath) {
  const targetPath = resolveWorkspacePath(filePath);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Fail '${filePath}' tidak wujud.`);
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`'${filePath}' adalah direktori, bukan fail.`);
  }

  // Read with max 1MB limit for performance
  if (stat.size > 1024 * 1024) {
    throw new Error(`Fail '${filePath}' terlalu besar (melebihi 1MB).`);
  }

  return fs.readFileSync(targetPath, "utf-8");
}

function search_code(query, dirPath = "") {
  if (!query || typeof query !== "string") {
    throw new Error("Kueri carian tidak sah.");
  }

  const targetDir = resolveWorkspacePath(dirPath);
  const matches = [];

  function searchInDir(currentDir) {
    if (matches.length >= 100) return; // Limit total results

    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      if (IGNORE_DIRS.has(item)) continue;

      const fullPath = path.join(currentDir, item);
      let itemStat;
      try {
        itemStat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (itemStat.isDirectory()) {
        searchInDir(fullPath);
      } else if (itemStat.isFile()) {
        // Skip binary / large files
        if (itemStat.size > 500 * 1024) continue;

        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                file: path.relative(WORKSPACE_ROOT, fullPath),
                line: index + 1,
                content: line.trim()
              });
            }
          });
        } catch {
          // Ignore unreadable files
        }
      }
    }
  }

  searchInDir(targetDir);
  return matches;
}

function create_file(filePath, content = "") {
  const targetPath = resolveWorkspacePath(filePath);

  // Ensure parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(targetPath, content, "utf-8");
  return `Fail '${filePath}' berjaya dicipta/dikemas kini (${content.length} aksara).`;
}

function edit_file(filePath, content) {
  const targetPath = resolveWorkspacePath(filePath);

  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(targetPath, content, "utf-8");
  return `Fail '${filePath}' berjaya dikemas kini (${content.length} aksara).`;
}

function delete_file(filePath) {
  const targetPath = resolveWorkspacePath(filePath);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Fail '${filePath}' tidak wujud.`);
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return `Direktori '${filePath}' berjaya dipadamkan.`;
  } else {
    fs.unlinkSync(targetPath);
    return `Fail '${filePath}' berjaya dipadamkan.`;
  }
}

module.exports = {
  WORKSPACE_ROOT,
  resolveWorkspacePath,
  getRelativeWorkspacePath,
  list_files,
  read_file,
  search_code,
  create_file,
  edit_file,
  delete_file
};
