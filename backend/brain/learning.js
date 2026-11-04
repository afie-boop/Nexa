const { normalizeScope } = require("./memory_scope");
const { findContradiction } = require("./contradiction");
const { applyMemoryQuality } = require("./memory_quality");

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
  const text = typeof userMessage === "string" ? userMessage.trim() : "";
  if (!text) {
    return { saved: [], skipped: "empty_message" };
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

  // Sensitive information is never eligible for persistent memory.
  // Keep processing the rest of a message so a harmless fact (e.g. a name)
  // is not lost merely because the same message also contains a secret.
  const sensitiveText = /\\b(?:password|passcode|kata laluan|otp|one[- ]time password|pin code|cvv|cvc|kad bank|bank card|credit card|debit card|nombor ic|no\\.? ic|mykad|passport number|social security)\\b/i.test(text) ||
    /\\b\\d{6}[- ]?\\d{2}[- ]?\\d{4}\\b/.test(text) ||
    /\\b(?:\\d[ -]?){13,19}\\b/.test(text);

  const extracted = await brain.extractMemory(text, {
    mode: options.mode || "auto",
    confidenceThreshold: typeof options.confidenceThreshold === "number" ? options.confidenceThreshold : 0.75,
    scope
  });

  const memories = Array.isArray(extracted?.memories) ? extracted.memories : [];
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
      const contradiction = findContradiction(brain, qualityMemory, scope);

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
