// Database-aware memory reconciliation.
// The old findContradiction() scans the on-disk vault, which is empty on Render
// when memories live in Postgres/Supabase. This module works on the list of the
// user's existing memories instead, so it behaves the same for both stores.
const { getContradictionKey } = require("./contradiction");

const STOP = new Set(["yang", "dan", "atau", "dengan", "untuk", "dari", "pada", "dalam", "itu", "ini", "the", "and", "has", "have", "pengguna", "user"]);

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(text) {
  return new Set(normalize(text).split(" ").filter(t => t.length >= 2 && !STOP.has(t)));
}

// Lead statements that announce something but do not say what it is.
const INCOMPLETE_LEAD = /^(?:(?:ingat|remember)[,:]?\s+)?(?:(?:pengguna|user)\s+|(?:aku|saya|sy|kita|i|we)\s+)(?:ada|mempunyai|punya|have|has|got)\s+(?:(?:satu|sebuah|a|one)\s+)?(?:projek|project|aplikasi|app|sistem)(?:\s+(?:peribadi|sendiri|personal|baru|new))?[.!?\s]*$/i;

function isIncompleteLead(text) {
  return INCOMPLETE_LEAD.test(String(text || "").trim());
}

/**
 * Decide what to do with a new memory given the user's existing memories.
 * Returns { action: "insert" | "duplicate" | "update", target? }.
 */
function reconcileMemory(newMemory, existing = []) {
  const content = String(newMemory?.content || "");
  const newNorm = normalize(content);
  const newTokens = tokenSet(content);
  if (!newNorm) return { action: "insert" };

  // 1. Exact duplicate.
  for (const item of existing) {
    if (normalize(item.content) === newNorm) return { action: "duplicate", target: item };
  }

  // 2. New information completes an older, incomplete fact
  //    (e.g. "ada projek peribadi" -> "projek peribadi bernama AXMchat").
  for (const item of existing) {
    if (!isIncompleteLead(item.content)) continue;
    if (item.type && newMemory.type && item.type !== newMemory.type) continue;
    const oldTokens = tokenSet(item.content);
    let covered = 0;
    for (const t of oldTokens) if (newTokens.has(t)) covered++;
    if (oldTokens.size && covered / oldTokens.size >= 0.5 && newTokens.size > oldTokens.size) {
      return { action: "update", target: item, reason: "completes_incomplete_fact" };
    }
  }

  // 3. Same subject, different value (e.g. new name / age / city): replace.
  const key = getContradictionKey(content, newMemory.type);
  for (const item of existing) {
    if (getContradictionKey(item.content, item.type) === key && key.startsWith("identity:")) {
      return { action: "update", target: item, reason: "contradiction" };
    }
  }

  // 4. Near-duplicate (very high token overlap): keep the richer one.
  for (const item of existing) {
    const oldTokens = tokenSet(item.content);
    if (!oldTokens.size || !newTokens.size) continue;
    let common = 0;
    for (const t of newTokens) if (oldTokens.has(t)) common++;
    const overlap = common / Math.min(oldTokens.size, newTokens.size);
    const jaccard = common / (oldTokens.size + newTokens.size - common);
    if (overlap >= 0.9 && jaccard >= 0.6) {
      return newTokens.size > oldTokens.size
        ? { action: "update", target: item, reason: "richer_version" }
        : { action: "duplicate", target: item };
    }
  }

  return { action: "insert" };
}

module.exports = { reconcileMemory, isIncompleteLead, INCOMPLETE_LEAD, normalize };
