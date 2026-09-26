const { normalizeScope } = require("./memory_scope");

/**
 * Learns durable user information from a chat turn.
 * This intentionally uses the user's message only, never the assistant answer,
 * and requires an authenticated user scope before anything is persisted.
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

  for (const memory of memories.slice(0, options.maxMemories || 3)) {
    try {
      const result = await brain.saveMemory(memory, { scope });
      if (result?.created || result?.duplicate) {
        saved.push({
          id: result.memory?.id || memory.id || null,
          path: result.path || result.memory?.path || null,
          created: !!result.created,
          duplicate: !!result.duplicate
        });
      }
    } catch (error) {
      console.warn("[Brain Learning Warning]:", error.message);
    }
  }

  return { saved };
}

module.exports = { learnFromChat };
