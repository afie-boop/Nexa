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
