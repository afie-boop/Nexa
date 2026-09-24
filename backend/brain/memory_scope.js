const path = require('path');

const VALID_SCOPE_TYPES = new Set(['user', 'project', 'knowledge', 'session']);

/**
 * Sanitizes an ID to prevent path traversal and filesystem issues.
 * Only allows alphanumeric, hyphen, and underscore.
 *
 * @param {string} id
 * @returns {string} Safe ID
 * @throws {Error} If ID contains path traversal or invalid characters
 */
function sanitizeScopeId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Scope Error: ID must be a non-empty string.');
  }

  const clean = id.trim();
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\') || clean.includes(':')) {
    throw new Error(`Security Violation: Unsafe scope ID detected "${id}".`);
  }

  // Allow alphanumeric, hyphen, underscore
  const sanitized = clean.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!sanitized) {
    throw new Error(`Scope Error: ID "${id}" contains no valid characters.`);
  }

  return sanitized;
}

/**
 * Normalizes and validates a scope object.
 *
 * @param {object} [scopeInput] Scope configuration
 * @returns {{ type: 'user'|'project'|'knowledge'|'session', userId: string|null, projectId: string|null, sessionId: string|null }}
 */
function normalizeScope(scopeInput) {
  if (!scopeInput || typeof scopeInput !== 'object') {
    return {
      type: 'knowledge',
      userId: null,
      projectId: null,
      sessionId: null
    };
  }

  const rawType = String(scopeInput.type || 'knowledge').toLowerCase().trim();
  if (!VALID_SCOPE_TYPES.has(rawType)) {
    throw new Error(`Scope Error: Invalid scope type "${scopeInput.type}". Must be one of: user, project, knowledge, session.`);
  }

  let userId = null;
  let projectId = null;
  let sessionId = null;

  if (rawType === 'user') {
    if (!scopeInput.userId) {
      throw new Error('Scope Error: "user" scope requires "userId".');
    }
    userId = sanitizeScopeId(scopeInput.userId);
  } else if (rawType === 'project') {
    if (!scopeInput.projectId) {
      throw new Error('Scope Error: "project" scope requires "projectId".');
    }
    projectId = sanitizeScopeId(scopeInput.projectId);
    if (scopeInput.userId) {
      userId = sanitizeScopeId(scopeInput.userId);
    }
  } else if (rawType === 'session') {
    if (!scopeInput.sessionId) {
      throw new Error('Scope Error: "session" scope requires "sessionId".');
    }
    sessionId = sanitizeScopeId(scopeInput.sessionId);
    if (scopeInput.userId) {
      userId = sanitizeScopeId(scopeInput.userId);
    }
  }

  return {
    type: rawType,
    userId,
    projectId,
    sessionId
  };
}

/**
 * Determines the safe relative directory path for a normalized scope.
 *
 * @param {{ type: string, userId: string|null, projectId: string|null, sessionId: string|null }} normScope
 * @returns {string} Relative folder path inside vault
 */
function getScopeDirectory(normScope) {
  const { type, userId, projectId, sessionId } = normScope;

  if (type === 'user' && userId) {
    return `Users/${userId}`;
  }
  if (type === 'project' && projectId) {
    return `Projects/${projectId}`;
  }
  if (type === 'session' && sessionId) {
    return `Memory/Sessions/${sessionId}`;
  }
  return 'Knowledge';
}

/**
 * Checks whether a note (with given frontmatter / metadata) is accessible under the given filter scope.
 *
 * Filtering Rules:
 * - Unscoped / Legacy notes or scopeType "knowledge" -> Globally accessible.
 * - If filter scope is NOT provided (null/undefined/knowledge) -> Only globally accessible (unscoped/knowledge) notes are returned.
 * - Private User memory (scopeType: "user") -> Accessible ONLY if filter scope type === "user" and userId matches.
 * - Private Project memory (scopeType: "project") -> Accessible ONLY if filter scope type === "project" and projectId matches.
 * - Private Session memory (scopeType: "session") -> Accessible ONLY if filter scope type === "session" and sessionId matches.
 *
 * @param {object} noteMetadata Frontmatter or note properties ({ scopeType, userId, projectId, sessionId })
 * @param {object} [filterScope] Request filter scope
 * @returns {boolean} True if note is allowed in filter scope
 */
function isNoteInScope(noteMetadata = {}, filterScope = null) {
  const normNoteScopeType = String(noteMetadata.scopeType || 'knowledge').toLowerCase().trim();

  const isGlobalNote = normNoteScopeType === 'knowledge' ||
    (!noteMetadata.scopeType && !noteMetadata.userId && !noteMetadata.projectId && !noteMetadata.sessionId);

  // If note is global / knowledge / legacy unscoped, it is always accessible
  if (isGlobalNote) {
    return true;
  }

  // If filter scope is not provided or is global 'knowledge', private notes are NEVER exposed
  if (!filterScope) {
    return false;
  }

  let normFilter;
  try {
    normFilter = normalizeScope(filterScope);
  } catch (err) {
    return false;
  }

  if (normFilter.type === 'knowledge') {
    return isGlobalNote;
  }

  // Scoped note checks:
  if (normNoteScopeType === 'user') {
    return noteMetadata.userId === normFilter.userId;
  }

  if (normNoteScopeType === 'project') {
    return noteMetadata.projectId === normFilter.projectId;
  }

  if (normNoteScopeType === 'session') {
    return noteMetadata.sessionId === normFilter.sessionId;
  }

  return false;
}

module.exports = {
  sanitizeScopeId,
  normalizeScope,
  getScopeDirectory,
  isNoteInScope
};
