const TEMPORARY_PATTERNS = [
  /^(hi|hello|hey|ok|okay|thanks|thank you|lol|haha|test)\\b/i,
  /\\b(right now|just now|for now|sementara|buat masa ini)\\b/i
];

const DURABLE_TYPES = new Set(["preference", "fact", "goal", "project", "knowledge", "instruction"]);

function clamp01(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function assessMemoryQuality(memory, options = {}) {
  if (!memory || typeof memory !== "object") {
    return { accepted: false, reason: "invalid_memory", confidence: 0, importance: 0, durability: 0 };
  }

  const content = String(memory.content || "").trim().replace(/\\s+/g, " ");
  if (!content) {
    return { accepted: false, reason: "empty_content", confidence: 0, importance: 0, durability: 0 };
  }

  const type = String(memory.type || "fact").trim().toLowerCase();
  const confidence = clamp01(memory.confidence, 0);
  const importance = clamp01(memory.importance, 0.7);

  if (content.length < (options.minLength || 8)) {
    return { accepted: false, reason: "too_short", confidence, importance, durability: 0 };
  }

  if (TEMPORARY_PATTERNS.some(pattern => pattern.test(content))) {
    return { accepted: false, reason: "temporary_information", confidence, importance, durability: 0 };
  }

  if (!DURABLE_TYPES.has(type)) {
    return { accepted: false, reason: "non_durable_type", confidence, importance, durability: 0 };
  }

  const durability = Math.max(
    0,
    Math.min(
      1,
      confidence * 0.55 +
      importance * 0.35 +
      (content.length >= 20 ? 0.1 : 0)
    )
  );

  const minConfidence = typeof options.minConfidence === "number" ? options.minConfidence : 0.75;
  const minDurability = typeof options.minDurability === "number" ? options.minDurability : 0.55;

  if (confidence < minConfidence) {
    return { accepted: false, reason: "low_confidence", confidence, importance, durability };
  }

  if (durability < minDurability) {
    return { accepted: false, reason: "low_durability", confidence, importance, durability };
  }

  return {
    accepted: true,
    reason: "durable_memory",
    confidence,
    importance,
    durability
  };
}

function applyMemoryQuality(memory, options = {}) {
  const assessment = assessMemoryQuality(memory, options);
  if (!assessment.accepted) return { memory: null, assessment };

  return {
    memory: {
      ...memory,
      confidence: assessment.confidence,
      importance: assessment.importance,
      durability: assessment.durability,
      quality: "durable"
    },
    assessment
  };
}

module.exports = { assessMemoryQuality, applyMemoryQuality };
