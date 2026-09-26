const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { recallMemories, lexicalRelevance } = require("./active_recall");

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "axmchat-recall-"));
fs.mkdirSync(path.join(vault, "Users/alice"), { recursive: true });
fs.writeFileSync(path.join(vault, "Users/alice/audio.md"), "---\nid: audio\ntype: preference\nscopeType: user\nuserId: alice\nconfidence: 0.95\nimportance: 0.9\ndurability: 0.9\nupdated: 2026-09-01T00:00:00Z\n---\nSaya suka bass kuat dan audio berkualiti.");
fs.mkdirSync(path.join(vault, "Users/bob"), { recursive: true });
fs.writeFileSync(path.join(vault, "Users/bob/audio.md"), "---\nid: bob\ntype: preference\nscopeType: user\nuserId: bob\nconfidence: 0.95\nimportance: 0.95\n---\nSaya suka bass kuat.");

assert(lexicalRelevance("bass audio", "Saya suka bass kuat dan audio berkualiti.") > 0);
const results = recallMemories(vault, "bass audio", [
  { path: "Users/alice/audio.md", score: 8, snippet: "bass audio" },
  { path: "Users/bob/audio.md", score: 10, snippet: "bass audio" }
], { scope: { type: "user", userId: "alice" }, limit: 5 });
assert.strictEqual(results.length, 1);
assert.strictEqual(results[0].path, "Users/alice/audio.md");
fs.rmSync(vault, { recursive: true, force: true });
console.log("active_recall.test.js passed");
