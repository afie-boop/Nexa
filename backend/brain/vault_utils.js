const path = require('path');

/**
 * Checks if a relative path inside the vault is a history or index path that should be excluded from search & indexing.
 *
 * Excluded paths:
 * - Memory/History/...
 * - .index/...
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
function isExcludedVaultPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    return false;
  }

  const normalized = relativePath.replace(/\\/g, '/');
  return (
    normalized.startsWith('Memory/History/') ||
    normalized.startsWith('.index/') ||
    normalized === 'Memory/History' ||
    normalized === '.index'
  );
}

module.exports = {
  isExcludedVaultPath
};
