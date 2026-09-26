const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { similarity, findConsolidationGroups, buildConsolidationUpdate } = require("./memory_consolidation");

function writeNote(vaultDir, relPath, frontmatter, body) {
  const fullPath = path.join(vaultDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(key + ":");
      value.forEach(item => lines.push("  - " + item));
    } else {
      lines.push(key + ": " + value);
    }
  }
  lines.push("---", body, "");
  fs.writeFileSync(fullPath, lines.join("\n"), "utf8");
}

(function run() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "axmchat-consolidation-"));

  writeNote(vault, "Users/alice/a.md", {
    id: "a", type: "preference", scopeType: "user", userId: "alice",
    importance: 0.8, confidence: 0.9, tags: ["audio"]
  }, "Saya suka audio yang bass kuat.");

  writeNote(vault, "Users/alice/b.md", {
    id: "b", type: "preference", scopeType: "user", userId: "alice",
    importance: 0.9, confidence: 0.95, tags: ["audio", "music"]
  }, "Saya suka muzik dengan bass yang kuat.");

  writeNote(vault, "Users/bob/c.md", {
    id: "c", type: "preference", scopeType: "user", userId: "bob"
  }, "Saya suka muzik klasik.");

  assert(similarity("bass kuat audio", "audio bass kuat") > 0.5);

  const groups = findConsolidationGroups(vault, {
    scope: { type: "user", userId: "alice" }, threshold: 0.4
  });
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].members.length, 2);
  assert(groups[0].members.every(member => member.frontmatter.userId === "alice"));

  const update = buildConsolidationUpdate(groups[0]);
  assert(update);
  assert.strictEqual(update.memberIds.length, 2);
  assert(update.content.includes("bass"));

  const bobGroups = findConsolidationGroups(vault, {
    scope: { type: "user", userId: "bob" }, threshold: 0.4
  });
  assert.strictEqual(bobGroups.length, 0);

  fs.rmSync(vault, { recursive: true, force: true });
  console.log("memory_consolidation.test.js passed");
})();
