const { Pool } = require("pg");

let pool = null;
let schemaPromise = null;

function enabled() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!enabled()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!enabled()) return false;
  if (!schemaPromise) {
    const db = getPool();
    schemaPromise = db.query(`
      CREATE TABLE IF NOT EXISTS axmchat_memories (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        user_id TEXT,
        project_id TEXT,
        session_id TEXT,
        title TEXT,
        content TEXT NOT NULL,
        type TEXT,
        category TEXT,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        version INTEGER NOT NULL DEFAULT 1,
        importance DOUBLE PRECISION,
        confidence DOUBLE PRECISION,
        durability DOUBLE PRECISION,
        quality JSONB,
        consolidated_from JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS axmchat_memories_scope_idx
        ON axmchat_memories(scope_type, user_id, project_id, session_id);
      CREATE INDEX IF NOT EXISTS axmchat_memories_updated_idx
        ON axmchat_memories(updated_at DESC);
    `).then(() => true).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function scopeValues(scope = {}) {
  return [
    scope.type || "knowledge",
    scope.userId || null,
    scope.projectId || null,
    scope.sessionId || null
  ];
}

function scopeWhere(scope, startIndex = 1) {
  const clauses = [`scope_type = $${startIndex}`];
  const values = [scope.type || "knowledge"];
  let i = startIndex + 1;
  if (scope.type === "user") {
    clauses.push(`user_id = $${i++}`);
    values.push(scope.userId || null);
  } else if (scope.type === "project") {
    clauses.push(`project_id = $${i++}`);
    values.push(scope.projectId || null);
  } else if (scope.type === "session") {
    clauses.push(`session_id = $${i++}`);
    values.push(scope.sessionId || null);
  }
  return { sql: clauses.join(" AND "), values, nextIndex: i };
}

function rowToMemory(row) {
  return {
    id: row.id,
    title: row.title || row.content.slice(0, 80),
    content: row.content,
    type: row.type || "memory",
    category: row.category || "memory",
    tags: Array.isArray(row.tags) ? row.tags : [],
    version: Number(row.version) || 1,
    created: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    path: `db://memory/${row.id}`,
    scope: {
      type: row.scope_type,
      userId: row.user_id || undefined,
      projectId: row.project_id || undefined,
      sessionId: row.session_id || undefined
    },
    importance: row.importance,
    confidence: row.confidence,
    durability: row.durability,
    quality: row.quality || undefined
  };
}

async function findExisting(memory, scope) {
  await ensureSchema();
  const db = getPool();
  const where = scopeWhere(scope, 2);
  const params = [String(memory.content || "").trim(), ...where.values];
  const result = await db.query(
    `SELECT * FROM axmchat_memories WHERE lower(content) = lower($1) AND ${where.sql} LIMIT 1`,
    params
  );
  return result.rows[0] ? rowToMemory(result.rows[0]) : null;
}

async function saveMemory(memory, scope) {
  await ensureSchema();
  const db = getPool();
  const existing = await findExisting(memory, scope);
  if (existing) return { created: false, duplicate: true, path: existing.path, memory: existing };

  const id = memory.id || "mem_" + require("crypto").createHash("sha256")
    .update(`${scope.type || "knowledge"}:${scope.userId || scope.projectId || scope.sessionId || ""}:${memory.content}`.toLowerCase())
    .digest("hex").slice(0, 12);
  const title = memory.title || (memory.content.length > 40 ? memory.content.slice(0, 40) + "..." : memory.content);

  const result = await db.query(
    `INSERT INTO axmchat_memories
      (id, scope_type, user_id, project_id, session_id, title, content, type, category, tags, version, importance, confidence, durability, quality, consolidated_from)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,1,$11,$12,$13,$14::jsonb,$15::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
      id, ...scopeValues(scope), title, memory.content.trim(),
      memory.type || "fact", memory.category || "memory",
      JSON.stringify(Array.isArray(memory.tags) ? memory.tags : []),
      memory.importance ?? 0.7, memory.confidence ?? 0.9, memory.durability ?? 0.7,
      JSON.stringify(memory.quality || null),
      JSON.stringify(Array.isArray(memory.consolidatedFrom) ? memory.consolidatedFrom : [])
    ]
  );
  const row = result.rows[0];
  if (!row) {
    const duplicate = await findExisting({ content: memory.content }, scope);
    return { created: false, duplicate: !!duplicate, path: duplicate?.path || `db://memory/${id}`, memory: duplicate || { ...memory, id, path: `db://memory/${id}` } };
  }
  return { created: true, path: `db://memory/${id}`, memory: rowToMemory(row) };
}

async function updateMemory(notePathOrId, updates, scope) {
  await ensureSchema();
  const db = getPool();
  const id = String(notePathOrId || "").replace(/^db:\/\/memory\//, "");
  const where = scopeWhere(scope, 2);
  const result = await db.query(
    `SELECT * FROM axmchat_memories WHERE id = $1 AND ${where.sql} LIMIT 1`,
    [id, ...where.values]
  );
  const current = result.rows[0];
  if (!current) throw new Error(`Update Memory Error: Memory "${notePathOrId}" does not exist.`);

  const nextVersion = (Number(current.version) || 1) + 1;
  const updatedContent = updates.content !== undefined ? String(updates.content).trim() : current.content;
  const updated = await db.query(
    `UPDATE axmchat_memories SET
      title=$2, content=$3, type=$4, category=$5, tags=$6::jsonb, version=$7,
      importance=$8, confidence=$9, durability=$10, quality=$11::jsonb,
      consolidated_from=$12::jsonb, updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [
      id,
      updates.title || current.title,
      updatedContent,
      updates.type || current.type,
      updates.category || current.category,
      JSON.stringify(updates.tags || current.tags || []),
      nextVersion,
      updates.importance ?? current.importance,
      updates.confidence ?? current.confidence,
      updates.durability ?? current.durability,
      JSON.stringify(updates.quality ?? current.quality ?? null),
      JSON.stringify(updates.consolidatedFrom ?? current.consolidated_from ?? [])
    ]
  );
  return { updated: true, path: `db://memory/${id}`, version: nextVersion, frontmatter: { ...rowToMemory(updated.rows[0]), id } };
}

async function deleteMemory(notePathOrId, scope) {
  await ensureSchema();
  const db = getPool();
  const id = String(notePathOrId || "").replace(/^db:\/\/memory\//, "");
  const where = scopeWhere(scope, 2);
  const result = await db.query(
    `DELETE FROM axmchat_memories WHERE id=$1 AND ${where.sql} RETURNING *`,
    [id, ...where.values]
  );
  if (!result.rows[0]) throw new Error(`Delete Memory Error: Memory "${notePathOrId}" was not found.`);
  const row = result.rows[0];
  return { deleted: true, memoryId: row.id, path: `db://memory/${row.id}`, previousVersion: Number(row.version) || 1, deleteVersion: (Number(row.version) || 1) + 1 };
}

async function listMemories(scope, limit = 100) {
  await ensureSchema();
  const db = getPool();
  const where = scopeWhere(scope, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await db.query(
    `SELECT * FROM axmchat_memories WHERE ${where.sql} ORDER BY updated_at DESC LIMIT $${where.nextIndex}`,
    [...where.values, safeLimit]
  );
  return result.rows.map(rowToMemory);
}

async function retrieveContext(query, scope, options = {}) {
  const memories = await listMemories(scope, options.maxSources || options.topK || 8);
  const tokens = String(query || "").toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(t => t.length >= 2);
  const ranked = memories.map(memory => {
    const haystack = memory.content.toLowerCase();
    let score = 0;
    for (const token of tokens) if (haystack.includes(token)) score += 1;
    if (memory.importance) score += Number(memory.importance) * 0.25;
    return { ...memory, score };
  }).filter(item => item.score > 0).sort((a,b) => b.score - a.score);

  const selected = ranked.slice(0, options.topK || 5);
  const maxChars = options.maxContextChars || 5000;
  let used = 0;
  const chunks = [];
  const sources = [];
  for (const memory of selected) {
    const chunk = `[${memory.type || "memory"}] ${memory.content}`;
    if (used + chunk.length > maxChars) break;
    chunks.push(chunk);
    sources.push({ path: memory.path, title: memory.title, score: memory.score });
    used += chunk.length;
  }
  return { context: chunks.join("\n"), sources };
}

async function health(scope) {
  const memories = await listMemories(scope, 500);
  return { status: "ok", count: memories.length, persistent: true, backend: "postgres" };
}

module.exports = {
  enabled,
  ensureSchema,
  saveMemory,
  findExisting,
  updateMemory,
  deleteMemory,
  listMemories,
  retrieveContext,
  health
};
