const { normalizeScope } = require("./memory_scope");
const { findContradiction } = require("./contradiction");
const { applyMemoryQuality } = require("./memory_quality");
const { reconcileMemory, isIncompleteLead } = require("./memory_reconcile");

const NON_ANSWERS = /^(ya|yes|yup|tak|tidak|no|nope|ok|okay|oke|entah|nanti|tak tahu|tak pasti|belum ada|rahsia|secret|haha|lol|hmm+|test|tak nak cakap)$/i;

function trimQuotes(text) {
  return String(text || "").trim().replace(/^["'\u201c\u201d\u2018\u2019`\s]+|["'\u201c\u201d\u2018\u2019`.!?,\s]+$/g, "");
}

function cleanName(text) {
  const raw = String(text || "").trim();
  let value = trimQuotes(raw);
  const quoted = /^["'\u201c\u2018`]/.test(raw);
  const before = value;
  value = value.replace(/^(?:namanya|nama(?:\s+(?:dia|projek|project))?(?:\s+(?:itu|tu))?(?:\s+(?:ialah|adalah))?|it'?s(?:\s+called|\s+named)?|called|named|the name is|dia|projek\s+(?:itu|tu)|ialah)\s+/i, "");
  return { name: trimQuotes(value), explicit: quoted || value !== before };
}

// A bare multi-word reply is only treated as a project name when it looks like
// one (digits / capitals after the first word) or the user marked it explicitly
// ("namanya Nexa Chat", quotes). Plain sentences are left to the AI extractor.
function looksLikeName(name, explicit) {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4 || name.length > 40) return false;
  if (explicit || words.length === 1) return true;
  return words.some((word, index) => /\d/.test(word) || (index > 0 && /^[A-Z]/.test(word)) || /[a-z][A-Z]/.test(word));
}

/**
 * When the previous USER turn was an incomplete lead ("aku ada projek peribadi")
 * and the latest turn is a short answer ("AXMchat"), combine them into one
 * complete memory. Returns null when the latest turn is not a clear answer.
 */
function completeProjectFromAnswer(userMessages) {
  if (!Array.isArray(userMessages) || userMessages.length < 2) return null;
  const previous = userMessages[userMessages.length - 2].content;
  const latest = userMessages[userMessages.length - 1].content;
  if (!isIncompleteLead(previous)) return null;
  if (/[?\uff1f]\s*$/.test(latest)) return null;

  const { name, explicit } = cleanName(latest);
  if (!name || NON_ANSWERS.test(name) || !looksLikeName(name, explicit)) return null;

  const noun = /aplikasi|\bapp\b/i.test(previous) ? "aplikasi" : /sistem/i.test(previous) ? "sistem" : "projek";
  const qualifier = /peribadi|personal/i.test(previous) ? " peribadi" : /sendiri/i.test(previous) ? " sendiri" : "";

  return {
    content: `Pengguna mempunyai ${noun}${qualifier} bernama ${name}.`,
    type: "project",
    category: "project",
    importance: 0.85,
    confidence: 0.95,
    tags: ["project", name.toLowerCase()],
    source: latest
  };
}

const MEMORY_TYPES = new Set(["preference", "fact", "goal", "project", "knowledge", "instruction"]);

function normalizeMemory(memory) {
  if (!memory || typeof memory !== "object") return null;

  const normalized = { ...memory };
  const type = String(normalized.type || "fact").trim().toLowerCase();

  normalized.type = MEMORY_TYPES.has(type) ? type : "fact";
  normalized.category = normalized.category || (
    ["goal", "project"].includes(normalized.type) ? "project" : normalized.type === "knowledge" || normalized.type === "instruction" ? "knowledge" : "user"
  );

  normalized.tags = Array.from(new Set(
    (Array.isArray(normalized.tags) ? normalized.tags : [])
      .map(tag => String(tag).trim().toLowerCase())
      .filter(Boolean)
      .concat(normalized.type)
  ));

  normalized.confidence = Math.max(0, Math.min(1, Number(normalized.confidence ?? 0)));
  normalized.importance = Math.max(0, Math.min(1, Number(normalized.importance ?? 0.7)));

  return normalized;
}

/**
 * Learns durable user information from a chat turn.
 * Classification is normalized before persistence. Exact duplicates are ignored,
 * while conservative contradictions update the existing note so history/versioning
 * preserves the previous value. Only the user's message is learned.
 */
async function learnFromChat(brain, userMessage, scopeInput, options = {}) {
  if (!brain || typeof brain.extractMemory !== "function" || typeof brain.saveMemory !== "function") {
    return { saved: [], skipped: "brain_unavailable" };
  }

  let scope;
  try {
    scope = normalizeScope(scopeInput);
  } catch (error) {
    return { saved: [], skipped: "invalid_scope", error: error.message };
  }

  if (scope.type !== "user" || !scope.userId) {
    return { saved: [], skipped: "missing_user" };
  }
  // Learn from recent USER turns together so a later answer can complete
  // an earlier partial fact. Assistant messages are deliberately excluded.
  const userMessages = (Array.isArray(userMessage) ? userMessage : [{ role: "user", content: userMessage }])
    .filter(item => item && (item.role === "user" || !item.role) && typeof item.content === "string")
    .map(item => ({ role: "user", content: item.content.trim() }))
    .filter(item => item.content)
    .slice(-8);
  const text = userMessages.length ? userMessages[userMessages.length - 1].content : "";
  if (!text) {
    return { saved: [], skipped: "empty_message" };
  }

  // Deterministic guard: a bare lead such as "aku ada projek peribadi" is an
  // incomplete fact. Keep it pending until a later user turn supplies the detail.
  if (isIncompleteLead(text)) {
    return { saved: [], skipped: "incomplete_project_waiting_for_detail" };
  }

  // Retrieval/meta questions must never become memories. In particular,
  // "kau ingat tak?" asks Brain to recall; it is not a fact to save.
  const isQuestion = /[?？]\s*$/.test(text) ||
    /^(apa|siapa|kenapa|mengapa|bagaimana|bila|di mana|kat mana|berapa|what|who|why|how|when|where|adakah|does|did|is|are|can|could|do)\b/i.test(text) ||
    /^(kau|awak|kamu|anda)\s+(ingat|tahu)\s+(tak|ke|kah)\b/i.test(text) ||
    /^(ingat tak|masih ingat|kau ingat|awak ingat|kamu ingat|do you remember|remember when)\b/i.test(text);
  if (isQuestion) {
    return { saved: [], skipped: "question_or_recall_not_memory" };
  }


  // A short answer that completes the previous incomplete statement is
  // combined deterministically; otherwise the normal extractor runs.
  const completed = completeProjectFromAnswer(userMessages);
  let memories;
  if (completed) {
    memories = [completed];
  } else {
    const extracted = await brain.extractMemory(userMessages, {
      mode: options.mode || "auto",
      confidenceThreshold: typeof options.confidenceThreshold === "number" ? options.confidenceThreshold : 0.75,
      scope
    });
    memories = Array.isArray(extracted?.memories) ? extracted.memories : [];
  }

  // Existing memories of this user, used to avoid duplicates, complete older
  // facts and replace contradicted ones. Works for Postgres and file storage.
  let existingMemories = [];
  try {
    const listed = await brain.listMemories({ scope, limit: 500 });
    if (Array.isArray(listed)) existingMemories = listed;
  } catch (error) {
    console.warn("[Brain Learning Warning] could not list existing memories:", error.message);
  }
  const saved = [];
  let duplicates = 0;
  let updated = 0;
  let consolidated = [];

  for (const rawMemory of memories.slice(0, options.maxMemories || 3)) {
    const memory = normalizeMemory(rawMemory);
    if (!memory || !memory.content) continue;

    const quality = applyMemoryQuality(memory, {
      minConfidence: typeof options.minConfidence === "number" ? options.minConfidence : 0.75,
      minDurability: typeof options.minDurability === "number" ? options.minDurability : 0.55
    });
    if (!quality.memory) continue;

    const qualityMemory = quality.memory;

    try {
      const decision = reconcileMemory(qualityMemory, existingMemories);

      if (decision.action === "duplicate") {
        duplicates += 1;
        saved.push({
          id: decision.target?.id || null,
          path: decision.target?.path || null,
          type: qualityMemory.type,
          category: qualityMemory.category,
          created: false,
          duplicate: true
        });
        continue;
      }

      let contradiction = null;
      if (decision.action === "update" && decision.target?.path && typeof brain.updateMemory === "function") {
        contradiction = {
          path: decision.target.path,
          frontmatter: { id: decision.target.id, importance: decision.target.importance, version: decision.target.version }
        };
      } else {
        // File-vault fallback (no database configured).
        contradiction = findContradiction(brain, qualityMemory, scope);
      }

      if (contradiction && contradiction.frontmatter?.id && typeof brain.updateMemory === "function") {
        const result = await brain.updateMemory(
          contradiction.path,
          {
            content: qualityMemory.content,
            type: qualityMemory.type,
            category: qualityMemory.category,
            tags: qualityMemory.tags,
            importance: Math.max(
              Number(contradiction.frontmatter.importance) || 0,
              qualityMemory.importance
            ),
            confidence: qualityMemory.confidence,
            durability: qualityMemory.durability,
            quality: qualityMemory.quality
          },
          { scope }
        );

        updated += 1;
        existingMemories = existingMemories.map(item => item.path === contradiction.path
          ? { ...item, content: qualityMemory.content, type: qualityMemory.type }
          : item);
        saved.push({
          id: contradiction.frontmatter.id,
          path: result.path || contradiction.path,
          type: qualityMemory.type,
          category: qualityMemory.category,
          created: false,
          updated: true,
          previousVersion: Number(contradiction.frontmatter.version) || 1,
          version: result.version
        });
        continue;
      }

      const result = await brain.saveMemory(qualityMemory, { scope });

      if (result?.duplicate) duplicates += 1;
      if (result?.created) existingMemories.push({ ...qualityMemory, id: result.memory?.id, path: result.path });

      if (result?.created || result?.duplicate) {
        saved.push({
          id: result.memory?.id || memory.id || null,
          path: result.path || result.memory?.path || null,
          type: memory.type,
          category: memory.category,
          created: !!result.created,
          duplicate: !!result.duplicate
        });
      }
    } catch (error) {
      console.warn("[Brain Learning Warning]:", error.message);
    }
  }

  if (options.consolidate !== false && saved.some(item => item.created) && typeof brain.consolidateMemories === "function") {
    try {
      const consolidation = await brain.consolidateMemories({
        scope,
        threshold: typeof options.consolidationThreshold === "number" ? options.consolidationThreshold : 0.55,
        limit: typeof options.consolidationLimit === "number" ? options.consolidationLimit : 3
      });
      consolidated = consolidation.updated || [];
    } catch (error) {
      console.warn("[Brain Consolidation Warning]:", error.message);
    }
  }

  return {
    saved,
    duplicates,
    updated,
    consolidated,
    classified: saved.map(item => ({
      id: item.id,
      type: item.type,
      category: item.category
    }))
  };
}

module.exports = { learnFromChat, normalizeMemory };
