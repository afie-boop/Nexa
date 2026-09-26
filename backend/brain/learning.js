const { normalizeScope } = require("./memory_scope");

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
 * Classification is normalized before persistence and duplicate memories are
 * reported without creating a second note. Only the user's message is learned.
 */
async function learnFromChat(brain, userMessage, session, options = {}) {
  if (!brain || typeof brain.extractMemory !== "function" || typeof brain.saveMemory !== "function") {
    return { saved: [], skipped: "brain_unavailable" };
  }

  if (!session || !session.connected || !session.accessToken || session.accessToken === "mock_token") {
    return { saved: [], skipped: "unauthenticated" };
  }

  const username = typeof session.username === "string" ? session.username.trim() : "";
  if (!username) {
    return { saved: [], skipped: "missing_user" };
  }

  const scope = normalizeScope({ type: "user", userId: username });
  const text = typeof userMessage === "string" ? userMessage.trim() : "";
  if (!text) {
    return { saved: [], skipped: "empty_message" };
  }

  const extracted = await brain.extractMemory(text, {
    mode: options.mode || "rules",
    confidenceThreshold: typeof options.confidenceThreshold === "number" ? options.confidenceThreshold : 0.75,
    scope
  });

  const memories = Array.isArray(extracted?.memories) ? extracted.memories : [];
  const saved = [];
  let duplicates = 0;

  for (const rawMemory of memories.slice(0, options.maxMemories || 3)) {
    const memory = normalizeMemory(rawMemory);
    if (!memory || !memory.content) continue;

    try {
      const result = await brain.saveMemory(memory, { scope });

      if (result?.duplicate) {
        duplicates += 1;
      }

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

  return {
    saved,
    duplicates,
    classified: saved.map(item => ({
      id: item.id,
      type: item.type,
      category: item.category
    }))
  };
}

module.exports = { learnFromChat, normalizeMemory };
