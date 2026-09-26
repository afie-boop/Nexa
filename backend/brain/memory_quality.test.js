const assert = require("assert");
const { assessMemoryQuality, applyMemoryQuality } = require("./memory_quality");

const good = assessMemoryQuality({
  content: "User prefers simple flat UI for AXMchat",
  type: "preference",
  confidence: 0.95,
  importance: 0.8
});
assert.strictEqual(good.accepted, true);
assert.strictEqual(good.reason, "durable_memory");
assert.ok(good.durability >= 0.55);

const short = assessMemoryQuality({
  content: "ok",
  type: "fact",
  confidence: 1,
  importance: 1
});
assert.strictEqual(short.accepted, false);
assert.strictEqual(short.reason, "too_short");

const temporary = assessMemoryQuality({
  content: "Saya mahu ini buat masa ini sahaja",
  type: "fact",
  confidence: 0.95,
  importance: 0.9
});
assert.strictEqual(temporary.accepted, false);
assert.strictEqual(temporary.reason, "temporary_information");

const weak = assessMemoryQuality({
  content: "User may like this",
  type: "fact",
  confidence: 0.4,
  importance: 0.8
});
assert.strictEqual(weak.accepted, false);
assert.strictEqual(weak.reason, "low_confidence");

const invalidType = assessMemoryQuality({
  content: "User prefers dark mode",
  type: "chat",
  confidence: 0.95,
  importance: 0.9
});
assert.strictEqual(invalidType.accepted, false);
assert.strictEqual(invalidType.reason, "non_durable_type");

const applied = applyMemoryQuality({
  content: "User wants AXMchat to have a smarter second brain",
  type: "goal",
  confidence: 0.9,
  importance: 0.9
});
assert.ok(applied.memory);
assert.strictEqual(applied.memory.quality, "durable");
assert.ok(applied.memory.durability >= 0.55);

console.log("Memory quality tests passed");
