const assert = require("assert");
const { learnFromChat, normalizeMemory } = require("./learning");

function createBrain(overrides = {}) {
  return {
    vaultDir: "/tmp/axmchat-brain",
    async extractMemory() {
      return {
        memories: [{
          content: "Saya suka Valorant",
          type: "preference",
          confidence: 0.95,
          importance: 0.8,
          tags: ["gaming"]
        }]
      };
    },
    async saveMemory(memory) {
      return {
        created: true,
        duplicate: false,
        path: "Users/tester/Memory.md",
        memory: { id: "mem_new", ...memory }
      };
    },
    async updateMemory(path, data) {
      return {
        path,
        version: 2
      };
    },
    ...overrides
  };
}

function session() {
  return {
    connected: true,
    accessToken: "real_github_token",
    username: "tester"
  };
}

async function run() {
  const normalized = normalizeMemory({
    content: "Saya suka Minecraft",
    type: "PREFERENCE",
    tags: [" Gaming ", "gaming"],
    confidence: 2,
    importance: -1
  });

  assert.strictEqual(normalized.type, "preference");
  assert.deepStrictEqual(normalized.tags.sort(), ["gaming", "preference"]);
  assert.strictEqual(normalized.confidence, 1);
  assert.strictEqual(normalized.importance, 0);

  const brain = createBrain();
  const learned = await learnFromChat(
    brain,
    "Saya sekarang suka Valorant",
    session()
  );

  assert.strictEqual(learned.saved.length, 1);
  assert.strictEqual(learned.saved[0].created, true);
  assert.strictEqual(learned.saved[0].type, "preference");
  assert.strictEqual(learned.updated, 0);

  const contradictionBrain = createBrain({
    async extractMemory() {
      return {
        memories: [{
          content: "Saya suka Valorant",
          type: "preference",
          confidence: 0.95,
          importance: 0.8,
          tags: ["gaming"]
        }]
      };
    },
    async saveMemory() {
      throw new Error("saveMemory should not run when contradiction is detected");
    },
    async updateMemory(path, data) {
      assert.strictEqual(path, "Users/tester/mem_minecraft.md");
      assert.strictEqual(data.type, "preference");
      assert.strictEqual(data.content, "Saya suka Valorant");
      return { path, version: 2 };
    }
  });

  const contradictionModule = require("./contradiction");
  const originalFind = contradictionModule.findContradiction;
  contradictionModule.findContradiction = () => ({
    path: "Users/tester/mem_minecraft.md",
    frontmatter: {
      id: "mem_minecraft",
      version: 1,
      importance: 0.9
    },
    content: "Saya suka Minecraft"
  });

  // learning.js captures the exported function at require time, so reload it
  // after replacing the dependency for this isolated test.
  delete require.cache[require.resolve("./learning")];
  const reloadedLearning = require("./learning");
  const updated = await reloadedLearning.learnFromChat(
    contradictionBrain,
    "Saya suka Valorant",
    session()
  );

  assert.strictEqual(updated.updated, 1);
  assert.strictEqual(updated.saved[0].updated, true);
  assert.strictEqual(updated.saved[0].previousVersion, 1);
  assert.strictEqual(updated.saved[0].version, 2);

  contradictionModule.findContradiction = originalFind;

  const anonymous = await learnFromChat(
    brain,
    "Saya suka Valorant",
    { connected: false }
  );
  assert.strictEqual(anonymous.skipped, "unauthenticated");

  console.log("Brain Learning Loop tests passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
