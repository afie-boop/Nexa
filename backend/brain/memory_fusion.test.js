const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fuseMemories, buildFusedContext, overlapScore } = require("./memory_fusion");

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "axmchat-fusion-"));
fs.mkdirSync(path.join(vault, "Users", "alice"), { recursive: true });
fs.mkdirSync(path.join(vault, "Users", "bob"), { recursive: true });

fs.writeFileSync(
  path.join(vault, "Users", "alice", "ui.md"),
  "---\nid: ui\ntype: preference\nconfidence: 0.95\nimportance: 0.9\ndurability: 0.9\nscope_type: user\nscope_id: alice\n---\nUser prefers a simple flat purple UI for AXMchat."
);

fs.writeFileSync(
  path.join(vault, "Users", "bob", "ui.md"),
  "---\nid: bob-ui\ntype: preference\nconfidence: 0.95\nimportance: 0.9\ndurability: 0.9\nscope_type: user\nscope_id: bob\n---\nUser prefers a glowing interface."
);

assert.ok(overlapScore("AXMchat simple UI", "User prefers a simple flat UI for AXMchat") > 0);

const fused = fuseMemories(
  vault,
  "AXMchat UI",
  [
    { name: "Alice UI", path: "Users/alice/ui.md", score: 0.9, sourceTypes: ["semantic"] },
    { name: "Bob UI", path: "Users/bob/ui.md", score: 0.95, sourceTypes: ["semantic"] }
  ],
  { scope: { type: "user", userId: "alice" }, limit: 5 }
);

assert.strictEqual(fused.length, 1);
assert.ok(fused[0].content.includes("simple flat purple UI"));
assert.ok(!fused[0].content.includes("glowing interface"));

const context = buildFusedContext("AXMchat UI", fused, 1000);
assert.ok(context.includes("FUSED BRAIN MEMORY"));
assert.ok(context.includes("Users/alice/ui.md"));

fs.rmSync(vault, { recursive: true, force: true });
console.log("Memory fusion tests passed");
