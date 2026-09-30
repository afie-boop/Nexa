const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "";
let pool = null;
let schemaReady = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30000
  });
}

const memoryFallback = new Map();

async function ensureSchema() {
  if (!pool) return false;
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS axmchat_work_context (
        session_id TEXT PRIMARY KEY,
        context JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(err => { schemaReady = null; throw err; });
  }
  await schemaReady;
  return true;
}

function cleanText(value, max=6000) {
  return typeof value === "string" ? value.trim().slice(0,max) : "";
}

async function getWorkContext(sessionId) {
  if (!sessionId) return null;
  try {
    if (await ensureSchema()) {
      const result = await pool.query("SELECT context, updated_at FROM axmchat_work_context WHERE session_id = $1",[sessionId]);
      const row=result.rows[0];
      if (row) return { ...row.context, lastUpdatedAt: row.updated_at };
    }
  } catch(err) { console.warn("[WorkContext] PostgreSQL read failed:",err.message); }
  return memoryFallback.get(sessionId) || null;
}

async function saveWorkContext(sessionId, update) {
  if (!sessionId) return null;
  const previous=await getWorkContext(sessionId);
  const now=new Date().toISOString();
  const next={
    project: cleanText(update.project || previous?.project || "AXMchat",500),
    currentTask: cleanText(update.currentTask || previous?.currentTask,1000),
    lastQuestion: cleanText(update.lastQuestion || previous?.lastQuestion,3000),
    lastAnswer: cleanText(update.lastAnswer || previous?.lastAnswer,6000),
    lastTaskType: update.lastTaskType==="code" ? "code" : "general",
    lastUpdatedBy: update.lastTaskType==="code" ? "code" : "general",
    lastUpdatedAt: now,
    recentTurns:[...(previous?.recentTurns||[]),{
      taskType:update.lastTaskType==="code"?"code":"general",
      question:cleanText(update.lastQuestion,1200),
      answer:cleanText(update.lastAnswer,2200),
      at:now
    }].slice(-6)
  };
  memoryFallback.set(sessionId,next);
  try {
    if (await ensureSchema()) await pool.query(`INSERT INTO axmchat_work_context (session_id,context,updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (session_id) DO UPDATE SET context=EXCLUDED.context,updated_at=NOW()`,[sessionId,JSON.stringify(next)]);
  } catch(err) { console.warn("[WorkContext] PostgreSQL write failed:",err.message); }
  return next;
}

function formatWorkContext(context) {
  if (!context) return "";
  const turns=(context.recentTurns||[]).slice(-4).map((t,i)=>`Turn ${i+1} [${t.taskType}]:\nUser: ${t.question}\nAI: ${t.answer}`).join("\n\n");
  return `[AXMCHAT SHARED PROJECT CONTEXT]
Project: ${context.project||"Not specified"}
Current task: ${context.currentTask||"Not specified"}
Last AI type: ${context.lastUpdatedBy||"unknown"}
Last user request: ${context.lastQuestion||"None"}
Last AI result:
${context.lastAnswer||"None"}

Recent shared turns:
${turns||"None"}

Rules:
- This is the persistent shared project context for AXMchat, not merely the current chat session.
- Treat this context as the shared workspace between General AI and Coding AI across chats.
- When referring to remembered work, say "shared project context" or "shared project memory", not "memory sesi ini" or "in this session".
- Continue useful progress from the previous AI.
- General AI should understand Coding AI progress when relevant.
- Coding AI should understand General AI decisions when relevant.
- Do not blindly repeat old answers; use this as working context.
[END AXMCHAT SHARED PROJECT CONTEXT]`;
}

module.exports={getWorkContext,saveWorkContext,formatWorkContext};