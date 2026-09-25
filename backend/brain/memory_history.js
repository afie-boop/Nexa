const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFrontmatter } = require('./properties');
const { isNoteInScope, normalizeScope, getScopeDirectory } = require('./memory_scope');
const { isExcludedVaultPath } = require('./vault_utils');

function hashContent(content) {
  return crypto.createHash('md5').update(content || '').digest('hex');
}

function sanitizeMemoryId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('History Error: memoryId must be a non-empty string.');
  }

  const clean = id.trim();
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\') || clean.includes(':')) {
    throw new Error(`Security Violation: Unsafe memoryId detected "${id}".`);
  }

  const sanitized = clean.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!sanitized) {
    throw new Error(`History Error: memoryId "${id}" contains no valid characters.`);
  }

  return sanitized;
}

function sanitizeVersion(version) {
  const num = Number(version);
  if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
    throw new Error(`History Error: Invalid version "${version}". Must be a positive integer.`);
  }
  return num;
}

function buildYamlFrontmatter(obj) {
  let lines = ['---'];
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;

    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof val === 'object' && val !== null) {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * Returns physical scoped directory path for history snapshots.
 *
 * Example:
 * Memory/History/Users/<userId>/<memId>/
 * Memory/History/Projects/<projectId>/<memId>/
 * Memory/History/Sessions/<sessionId>/<memId>/
 * Memory/History/Knowledge/<memId>/
 */
function getHistoryScopeDirectory(vaultDir, normScope, memId) {
  const absoluteVault = path.resolve(vaultDir);
  const baseHistoryDir = path.resolve(absoluteVault, 'Memory', 'History');

  let scopeSubDir;
  if (normScope.type === 'session') {
    scopeSubDir = `Sessions/${normScope.sessionId}`;
  } else {
    scopeSubDir = getScopeDirectory(normScope);
  }

  const historyScopeDir = path.resolve(baseHistoryDir, scopeSubDir, memId);

  // Security Check: Enforce history path remains inside vault's Memory/History directory
  if (!historyScopeDir.startsWith(baseHistoryDir + path.sep) && historyScopeDir !== baseHistoryDir) {
    throw new Error(`Security Violation: History path escape detected for memoryId "${memId}".`);
  }

  return historyScopeDir;
}

function saveHistorySnapshot(vaultDir, snapshotData) {
  const absoluteVault = path.resolve(vaultDir);
  const memId = sanitizeMemoryId(snapshotData.memoryId);
  const version = sanitizeVersion(snapshotData.version);

  const frontmatter = snapshotData.frontmatter || {};
  const normScope = normalizeScope(frontmatter.scopeType ? {
    type: frontmatter.scopeType,
    userId: frontmatter.userId,
    projectId: frontmatter.projectId,
    sessionId: frontmatter.sessionId
  } : snapshotData.scope);

  const absoluteHistoryDir = getHistoryScopeDirectory(absoluteVault, normScope, memId);

  if (!fs.existsSync(absoluteHistoryDir)) {
    fs.mkdirSync(absoluteHistoryDir, { recursive: true });
  }

  const versionFileName = `v${version}.md`;
  const absoluteSnapshotPath = path.resolve(absoluteHistoryDir, versionFileName);

  if (!absoluteSnapshotPath.startsWith(absoluteHistoryDir + path.sep)) {
    throw new Error(`Security Violation: Snapshot filename escape detected "${versionFileName}".`);
  }

  const now = new Date().toISOString();
  const content = snapshotData.content || '';

  const prevVer = snapshotData.previousVersion !== undefined && snapshotData.previousVersion !== null && !isNaN(Number(snapshotData.previousVersion))
    ? Number(snapshotData.previousVersion)
    : null;
  const restVer = snapshotData.restoredFromVersion !== undefined && snapshotData.restoredFromVersion !== null && !isNaN(Number(snapshotData.restoredFromVersion))
    ? Number(snapshotData.restoredFromVersion)
    : null;

  const historyFrontmatter = {
    ...frontmatter,
    memoryId: memId,
    version,
    operation: snapshotData.operation || 'update',
    previousVersion: prevVer,
    restoredFromVersion: restVer,
    contentHash: hashContent(content),
    snapshotCreatedAt: now,
    scopeType: normScope.type,
    userId: normScope.userId,
    projectId: normScope.projectId,
    sessionId: normScope.sessionId
  };

  const yamlText = buildYamlFrontmatter(historyFrontmatter);
  const fullSnapshotMarkdown = `${yamlText}\n${content.trim()}\n`;

  fs.writeFileSync(absoluteSnapshotPath, fullSnapshotMarkdown, 'utf-8');

  return path.relative(absoluteVault, absoluteSnapshotPath).replace(/\\/g, '/');
}

function getMemoryHistory(vaultDir, memoryId, options = {}) {
  if (!vaultDir || !memoryId) {
    return [];
  }

  const absoluteVault = path.resolve(vaultDir);
  const memId = sanitizeMemoryId(memoryId);
  const filterScope = options.scope !== undefined ? options.scope : null;

  const baseHistoryDir = path.resolve(absoluteVault, 'Memory', 'History');
  if (!fs.existsSync(baseHistoryDir)) {
    return [];
  }

  const historyList = [];

  // If filterScope provided, check specific scoped history directory first
  let targetDirs = [];
  if (filterScope) {
    const normScope = normalizeScope(filterScope);
    if (normScope.type !== 'knowledge') {
      const scopedHistoryDir = getHistoryScopeDirectory(absoluteVault, normScope, memId);
      if (fs.existsSync(scopedHistoryDir)) {
        targetDirs.push(scopedHistoryDir);
      }
    } else {
      // Global knowledge search can scan Knowledge subfolder as well as legacy unscoped history folder
      const scopedHistoryDir = getHistoryScopeDirectory(absoluteVault, normScope, memId);
      if (fs.existsSync(scopedHistoryDir)) {
        targetDirs.push(scopedHistoryDir);
      }
      const legacyHistoryDir = path.resolve(baseHistoryDir, memId);
      if (fs.existsSync(legacyHistoryDir)) {
        targetDirs.push(legacyHistoryDir);
      }
    }
  } else {
    // Unscoped search - check legacy history folder or find all history dirs
    const legacyHistoryDir = path.resolve(baseHistoryDir, memId);
    if (fs.existsSync(legacyHistoryDir)) {
      targetDirs.push(legacyHistoryDir);
    }
    if (targetDirs.length === 0) {
      targetDirs = findHistoryDirsForMemoryId(baseHistoryDir, memId);
    }
  }

  const processedPaths = new Set();

  for (const absoluteHistoryDir of targetDirs) {
    if (!fs.existsSync(absoluteHistoryDir)) continue;

    const files = fs.readdirSync(absoluteHistoryDir);

    for (const file of files) {
      if (!file.endsWith('.md') || !file.startsWith('v')) continue;

      const fullFilePath = path.join(absoluteHistoryDir, file);
      if (processedPaths.has(fullFilePath)) continue;
      processedPaths.add(fullFilePath);

      try {
        const raw = fs.readFileSync(fullFilePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw);

        if (!isNoteInScope(frontmatter, filterScope)) {
          continue;
        }

        const relPath = path.relative(absoluteVault, fullFilePath).replace(/\\/g, '/');
        const parsedVer = Number(frontmatter.version) || parseInt(file.replace(/^v|\.md$/g, ''), 10);

        const prevVer = frontmatter.previousVersion !== undefined && frontmatter.previousVersion !== null && !isNaN(Number(frontmatter.previousVersion))
          ? Number(frontmatter.previousVersion)
          : null;
        const restVer = frontmatter.restoredFromVersion !== undefined && frontmatter.restoredFromVersion !== null && !isNaN(Number(frontmatter.restoredFromVersion))
          ? Number(frontmatter.restoredFromVersion)
          : null;

        historyList.push({
          version: parsedVer,
          operation: frontmatter.operation || 'update',
          previousVersion: prevVer,
          restoredFromVersion: restVer,
          contentHash: frontmatter.contentHash || '',
          snapshotCreatedAt: frontmatter.snapshotCreatedAt || frontmatter.created || '',
          scopeType: frontmatter.scopeType || 'knowledge',
          userId: frontmatter.userId || null,
          projectId: frontmatter.projectId || null,
          sessionId: frontmatter.sessionId || null,
          path: relPath
        });
      } catch (e) {
        // Ignore unreadable history snapshots
      }
    }
  }

  historyList.sort((a, b) => a.version - b.version);
  return historyList;
}

async function restoreMemory(vaultDir, memoryId, targetVersion, options = {}) {
  if (!vaultDir || !memoryId) {
    throw new Error('Restore Error: vaultDir and memoryId are required.');
  }

  const absoluteVault = path.resolve(vaultDir);
  const memId = sanitizeMemoryId(memoryId);
  const versionToRestore = sanitizeVersion(targetVersion);
  const filterScope = options.scope !== undefined ? options.scope : null;

  const allMdFiles = getAllMdFiles(absoluteVault, absoluteVault);
  let activeMemoryFilePath = null;
  let activeFrontmatter = null;

  for (const filePath of allMdFiles) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(raw);

      if (frontmatter.id === memId) {
        if (!isNoteInScope(frontmatter, filterScope)) {
          throw new Error(`Security Violation: Unauthorized scope access to memory history for memoryId "${memId}".`);
        }
        activeMemoryFilePath = filePath;
        activeFrontmatter = frontmatter;
        break;
      }
    } catch (e) {
      if (e.message.startsWith('Security Violation')) throw e;
    }
  }

  if (!activeMemoryFilePath || !activeFrontmatter) {
    throw new Error(`Restore Error: Active memory note with ID "${memId}" not found or unauthorized in requested scope.`);
  }

  const existingHistory = getMemoryHistory(absoluteVault, memId, { scope: filterScope });
  const snapshotMeta = existingHistory.find(h => h.version === versionToRestore);

  if (!snapshotMeta) {
    throw new Error(`Restore Error: Snapshot version v${versionToRestore} does not exist or unauthorized for memoryId "${memId}".`);
  }

  const absoluteSnapshotPath = path.resolve(absoluteVault, snapshotMeta.path);

  if (!fs.existsSync(absoluteSnapshotPath)) {
    throw new Error(`Restore Error: Snapshot file v${versionToRestore} missing at "${snapshotMeta.path}".`);
  }

  const snapshotRaw = fs.readFileSync(absoluteSnapshotPath, 'utf-8');
  const { frontmatter: snapshotFrontmatter, body: snapshotBody } = parseFrontmatter(snapshotRaw);

  if (!isNoteInScope(snapshotFrontmatter, filterScope)) {
    throw new Error(`Security Violation: Unauthorized scope access to snapshot v${versionToRestore}.`);
  }

  const latestVersion = existingHistory.length > 0 ? Math.max(...existingHistory.map(h => h.version)) : (Number(activeFrontmatter.version) || 1);
  const newVersion = latestVersion + 1;
  const now = new Date().toISOString();

  const updatedFrontmatter = {
    ...activeFrontmatter,
    title: snapshotFrontmatter.title || activeFrontmatter.title,
    type: snapshotFrontmatter.type || activeFrontmatter.type,
    category: snapshotFrontmatter.category || activeFrontmatter.category,
    tags: snapshotFrontmatter.tags || activeFrontmatter.tags,
    version: newVersion,
    updated: now
  };

  const yamlLines = ['---'];
  for (const [key, val] of Object.entries(updatedFrontmatter)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      yamlLines.push(`${key}:`);
      for (const item of val) yamlLines.push(`  - ${item}`);
    } else if (typeof val === 'object' && val !== null) {
      yamlLines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      yamlLines.push(`${key}: ${val}`);
    }
  }
  yamlLines.push('---');

  const restoredMarkdownContent = `${yamlLines.join('\n')}\n${snapshotBody.trim()}\n`;
  fs.writeFileSync(activeMemoryFilePath, restoredMarkdownContent, 'utf-8');

  saveHistorySnapshot(absoluteVault, {
    memoryId: memId,
    version: newVersion,
    operation: 'restore',
    previousVersion: Number(activeFrontmatter.version) || latestVersion,
    restoredFromVersion: versionToRestore,
    content: snapshotBody,
    frontmatter: updatedFrontmatter
  });

  const relActivePath = path.relative(absoluteVault, activeMemoryFilePath).replace(/\\/g, '/');

  return {
    restored: true,
    currentVersion: newVersion,
    path: relActivePath,
    memory: {
      id: memId,
      path: relActivePath,
      content: snapshotBody.trim(),
      version: newVersion,
      restoredFromVersion: versionToRestore,
      frontmatter: updatedFrontmatter
    }
  };
}

function findHistoryDirsForMemoryId(baseHistoryDir, memId) {
  const dirs = [];
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === memId) {
          dirs.push(full);
        } else {
          scan(full);
        }
      }
    }
  }
  scan(baseHistoryDir);
  return dirs;
}

function getAllMdFiles(dir, absoluteVault) {
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
      results = results.concat(getAllMdFiles(fullPath, absoluteVault));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

module.exports = {
  sanitizeMemoryId,
  sanitizeVersion,
  saveHistorySnapshot,
  getMemoryHistory,
  restoreMemory
};
