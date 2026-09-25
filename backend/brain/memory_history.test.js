const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Brain, getMemoryHistory, restoreMemory } = require('./index');

console.log('--- Running AXMchat Brain Memory History & Versioning Unit Tests ---');

async function runTests() {
  const tempVaultDir = path.join(__dirname, 'test_temp_memory_history_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempVaultDir, { recursive: true });

  const brain = new Brain(tempVaultDir);
  const userScope = { scope: { type: 'user', userId: 'user1' } };
  const otherUserScope = { scope: { type: 'user', userId: 'user2' } };

  // 1. Creation & v1 Snapshot Test
  console.log('1. Testing Memory Creation & v1 Snapshot...');
  const saveRes = await brain.saveMemory({ content: 'Initial version 1 content' }, userScope);
  const memId = saveRes.memory.id;

  assert.strictEqual(saveRes.created, true);
  assert.strictEqual(saveRes.memory.version, 1);

  const historyV1 = brain.getMemoryHistory(memId, userScope);
  assert.strictEqual(historyV1.length, 1);
  assert.strictEqual(historyV1[0].version, 1);
  assert.strictEqual(historyV1[0].operation, 'create');
  assert.strictEqual(historyV1[0].previousVersion, null);

  // 2. Memory Update & v2 Snapshot Test
  console.log('2. Testing Memory Update & v2 Snapshot...');
  const updateRes = await brain.updateMemory(saveRes.path, { content: 'Updated version 2 content' }, userScope);
  assert.strictEqual(updateRes.updated, true);
  assert.strictEqual(updateRes.version, 2);

  const historyV2 = brain.getMemoryHistory(memId, userScope);
  assert.strictEqual(historyV2.length, 2);
  assert.strictEqual(historyV2[1].version, 2);
  assert.strictEqual(historyV2[1].operation, 'update');
  assert.strictEqual(historyV2[1].previousVersion, 1);

  // 3. Multiple Updates (v3)
  console.log('3. Testing Multiple Updates (v3)...');
  await brain.updateMemory(saveRes.path, { content: 'Updated version 3 content' }, userScope);
  const historyV3 = brain.getMemoryHistory(memId, userScope);
  assert.strictEqual(historyV3.length, 3);
  assert.strictEqual(historyV3[2].version, 3);

  // 4. Memory Restoration Test (Restore v1 -> creates v4)
  console.log('4. Testing Memory Restore (v1 -> v4)...');
  const restoreRes = await brain.restoreMemory(memId, 1, userScope);
  assert.strictEqual(restoreRes.restored, true);
  assert.strictEqual(restoreRes.currentVersion, 4);
  assert.strictEqual(restoreRes.memory.content, 'Initial version 1 content');

  const historyV4 = brain.getMemoryHistory(memId, userScope);
  assert.strictEqual(historyV4.length, 4);
  assert.strictEqual(historyV4[3].version, 4);
  assert.strictEqual(historyV4[3].operation, 'restore');
  assert.strictEqual(historyV4[3].restoredFromVersion, 1);

  // Verify snapshots v1, v2, v3 remain intact in history folder
  assert.ok(fs.existsSync(path.join(tempVaultDir, 'Memory', 'History', memId, 'v1.md')));
  assert.ok(fs.existsSync(path.join(tempVaultDir, 'Memory', 'History', memId, 'v2.md')));
  assert.ok(fs.existsSync(path.join(tempVaultDir, 'Memory', 'History', memId, 'v3.md')));
  assert.ok(fs.existsSync(path.join(tempVaultDir, 'Memory', 'History', memId, 'v4.md')));

  // 5. Scope Isolation Tests (User 2 cannot access or restore User 1 history)
  console.log('5. Testing Scope Isolation for Memory History...');
  const user2History = brain.getMemoryHistory(memId, otherUserScope);
  assert.strictEqual(user2History.length, 0, 'User 2 must not see User 1 memory history');

  await assert.rejects(async () => {
    await brain.restoreMemory(memId, 1, otherUserScope);
  }, /Security Violation|Restore Error/);

  // 6. Security Tests (Traversal, invalid IDs, malicious version params)
  console.log('6. Testing Security Controls...');
  assert.throws(() => brain.getMemoryHistory('../user1'), /History Error|Security Violation/);
  assert.throws(() => brain.getMemoryHistory('memId/traversal'), /History Error|Security Violation/);

  await assert.rejects(async () => {
    await brain.restoreMemory(memId, -1, userScope);
  }, /History Error/);

  await assert.rejects(async () => {
    await brain.restoreMemory(memId, 'invalid_v', userScope);
  }, /History Error/);

  // 7. Search/Index Isolation Test (History snapshots do NOT appear in RAG/Search/Semantic/Graph)
  console.log('7. Testing Search/RAG/Semantic Index Isolation...');
  const searchRes = brain.searchNotes('version 2', userScope);
  const historyInSearch = searchRes.find(s => s.path.includes('Memory/History'));
  assert.strictEqual(historyInSearch, undefined, 'History snapshots must NEVER appear in full-text search');

  const ragRes = await brain.retrieveContext('Initial version 1', userScope);
  const historyInRAG = ragRes.sources.find(s => s.path.includes('Memory/History'));
  assert.strictEqual(historyInRAG, undefined, 'History snapshots must NEVER appear in RAG context retrieval');

  const graphData = brain.buildGraph();
  const historyInGraph = graphData.nodes.find(n => n.path.includes('Memory/History'));
  assert.strictEqual(historyInGraph, undefined, 'History snapshots must NEVER appear in Graph Builder');

  // 8. Backward Compatibility Test (Legacy memory without version)
  console.log('8. Testing Legacy Memory Backward Compatibility...');
  const knowledgeFolder = path.join(tempVaultDir, 'Knowledge');
  if (!fs.existsSync(knowledgeFolder)) {
    fs.mkdirSync(knowledgeFolder, { recursive: true });
  }
  const legacyPath = path.join(knowledgeFolder, 'LegacyMemory.md');
  fs.writeFileSync(
    legacyPath,
    `---
id: mem_legacy123
title: Legacy Memory
---
Legacy content without version.`
  );

  const updateLegacyRes = await brain.updateMemory('Knowledge/LegacyMemory.md', { content: 'Updated legacy content' });
  assert.strictEqual(updateLegacyRes.updated, true);
  assert.strictEqual(updateLegacyRes.version, 2);

  const legacyHistory = brain.getMemoryHistory('mem_legacy123');
  assert.strictEqual(legacyHistory.length, 1);
  assert.strictEqual(legacyHistory[0].version, 2);

  // Cleanup
  fs.rmSync(tempVaultDir, { recursive: true, force: true });

  console.log('✅ ALL MEMORY HISTORY & VERSIONING TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Memory History Test Failed:', err);
  process.exit(1);
});
