const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  Brain,
  sanitizeMemoryId,
  getMemoryHistory,
  restoreMemory
} = require('./index');

console.log('--- Running AXMchat Brain Memory History & Versioning Hardened Unit Tests ---');

async function runTests() {
  const tempVaultDir = path.join(__dirname, 'test_temp_memory_history_hardened_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempVaultDir, { recursive: true });

  const brain = new Brain(tempVaultDir);

  const scopeUserA = { scope: { type: 'user', userId: 'userA' } };
  const scopeUserB = { scope: { type: 'user', userId: 'userB' } };
  const scopeProjA = { scope: { type: 'project', projectId: 'projA' } };
  const scopeProjB = { scope: { type: 'project', projectId: 'projB' } };
  const scopeSessA = { scope: { type: 'session', sessionId: 'sessA' } };
  const scopeSessB = { scope: { type: 'session', sessionId: 'sessB' } };
  const scopeKnowledge = { scope: { type: 'knowledge' } };

  // 1. Physical Scope Isolation in History Snapshots
  console.log('1. Testing Physical Scope Isolation in History Snapshots...');
  const memUserA = await brain.saveMemory({ content: 'User A confidential history text' }, scopeUserA);
  const memProjA = await brain.saveMemory({ content: 'Project A confidential history text' }, scopeProjA);
  const memSessA = await brain.saveMemory({ content: 'Session A confidential history text' }, scopeSessA);
  const memKnow = await brain.saveMemory({ content: 'Knowledge global history text' }, scopeKnowledge);

  const historyUserA = brain.getMemoryHistory(memUserA.memory.id, scopeUserA);
  assert.strictEqual(historyUserA.length, 1);
  assert.ok(historyUserA[0].path.startsWith('Memory/History/Users/userA/'), 'User history must be physically stored in Memory/History/Users/userA/');

  const historyProjA = brain.getMemoryHistory(memProjA.memory.id, scopeProjA);
  assert.strictEqual(historyProjA.length, 1);
  assert.ok(historyProjA[0].path.startsWith('Memory/History/Projects/projA/'), 'Project history must be physically stored in Memory/History/Projects/projA/');

  const historySessA = brain.getMemoryHistory(memSessA.memory.id, scopeSessA);
  assert.strictEqual(historySessA.length, 1);
  assert.ok(historySessA[0].path.startsWith('Memory/History/Sessions/sessA/'), 'Session history must be physically stored in Memory/History/Sessions/sessA/');

  const historyKnow = brain.getMemoryHistory(memKnow.memory.id, scopeKnowledge);
  assert.strictEqual(historyKnow.length, 1);
  assert.ok(historyKnow[0].path.startsWith('Memory/History/Knowledge/'), 'Knowledge history must be physically stored in Memory/History/Knowledge/');

  // 2. Same-Content Memory Collision Prevention
  console.log('2. Testing Same-Content Memory Collision Prevention Across Scopes...');
  const identicalText = 'Identical memory content across different users';
  const memColA = await brain.saveMemory({ content: identicalText }, scopeUserA);
  const memColB = await brain.saveMemory({ content: identicalText }, scopeUserB);

  // Even if content is identical, history paths and records must not collide or bleed
  const histColA = brain.getMemoryHistory(memColA.memory.id, scopeUserA);
  const histColB = brain.getMemoryHistory(memColB.memory.id, scopeUserB);

  assert.strictEqual(histColA.length, 1);
  assert.strictEqual(histColB.length, 1);
  assert.notStrictEqual(histColA[0].path, histColB[0].path);
  assert.ok(histColA[0].path.includes('Users/userA/'));
  assert.ok(histColB[0].path.includes('Users/userB/'));

  // User A cannot see User B's history
  const crossUserHist = brain.getMemoryHistory(memColB.memory.id, scopeUserA);
  assert.strictEqual(crossUserHist.length, 0);

  // 3. History Security & Path Traversal Guards
  console.log('3. Testing History Path Traversal & Unsafe ID Guards...');
  assert.throws(() => brain.getMemoryHistory('../userA'), /Security Violation|History Error/);
  assert.throws(() => brain.getMemoryHistory('../../etc/passwd'), /Security Violation|History Error/);
  assert.throws(() => brain.getMemoryHistory('memId\\traversal'), /Security Violation|History Error/);

  await assert.rejects(async () => {
    await brain.restoreMemory(memUserA.memory.id, 1, scopeUserB);
  }, /Security Violation|Restore Error/);

  await assert.rejects(async () => {
    await brain.restoreMemory(memUserA.memory.id, -5, scopeUserA);
  }, /History Error/);

  await assert.rejects(async () => {
    await brain.restoreMemory(memUserA.memory.id, 'malicious_ver', scopeUserA);
  }, /History Error/);

  // 4. History Snapshots Exclusion from Indexing & Search
  console.log('4. Testing History Snapshots Exclusion from All Indexing & Search Systems...');
  await brain.updateMemory(memUserA.path, { content: 'UniqueSnapshotTermXYZ in v2' }, scopeUserA);

  // Search full-text
  const ftResults = brain.searchNotes('UniqueSnapshotTermXYZ', scopeUserA);
  const historyInFT = ftResults.find(r => r.path.startsWith('Memory/History'));
  assert.strictEqual(historyInFT, undefined, 'History snapshot must NOT appear in full-text search');

  // RAG Context Retrieval
  const ragResults = await brain.retrieveContext('UniqueSnapshotTermXYZ', scopeUserA);
  const historyInRAG = ragResults.sources.find(s => s.path.startsWith('Memory/History'));
  assert.strictEqual(historyInRAG, undefined, 'History snapshot must NOT appear in RAG context retrieval');

  // Graph Builder
  const graphData = brain.buildGraph();
  const historyInGraph = graphData.nodes.find(n => n.path.startsWith('Memory/History'));
  assert.strictEqual(historyInGraph, undefined, 'History snapshot must NOT appear in Graph Builder');

  // Backlinks & WikiLinks
  const backlinks = brain.getBacklinks(memUserA.path);
  const historyInBacklinks = backlinks.find(b => b.relativePath.startsWith('Memory/History'));
  assert.strictEqual(historyInBacklinks, undefined, 'History snapshot must NOT appear in Backlinks');

  // 5. Versioning Operations (Create -> v1, Update -> v2, Update -> v3, Restore v1 -> v4)
  console.log('5. Testing Full Versioning Sequence (v1 -> v2 -> v3 -> restore v1 -> v4)...');
  const v1Memory = await brain.saveMemory({ content: 'Version 1 base content' }, scopeProjA);
  const v1MemId = v1Memory.memory.id;

  await brain.updateMemory(v1Memory.path, { content: 'Version 2 updated content' }, scopeProjA);
  await brain.updateMemory(v1Memory.path, { content: 'Version 3 updated content' }, scopeProjA);

  const historyBeforeRestore = brain.getMemoryHistory(v1MemId, scopeProjA);
  assert.strictEqual(historyBeforeRestore.length, 3);
  assert.strictEqual(historyBeforeRestore[0].version, 1);
  assert.strictEqual(historyBeforeRestore[1].version, 2);
  assert.strictEqual(historyBeforeRestore[2].version, 3);

  // Restore v1
  const restoreRes = await brain.restoreMemory(v1MemId, 1, scopeProjA);
  assert.strictEqual(restoreRes.restored, true);
  assert.strictEqual(restoreRes.currentVersion, 4);
  assert.strictEqual(restoreRes.memory.content, 'Version 1 base content');

  const historyAfterRestore = brain.getMemoryHistory(v1MemId, scopeProjA);
  assert.strictEqual(historyAfterRestore.length, 4);
  assert.strictEqual(historyAfterRestore[3].version, 4);
  assert.strictEqual(historyAfterRestore[3].operation, 'restore');
  assert.strictEqual(historyAfterRestore[3].restoredFromVersion, 1);

  // 6. Legacy History Path Compatibility
  console.log('6. Testing Legacy Unscoped History Readability...');
  const legacyHistDir = path.join(tempVaultDir, 'Memory', 'History', 'mem_legacy999');
  fs.mkdirSync(legacyHistDir, { recursive: true });
  fs.writeFileSync(
    path.join(legacyHistDir, 'v1.md'),
    `---
memoryId: mem_legacy999
version: 1
scopeType: knowledge
---
Legacy history content.`
  );

  const legacyHistory = brain.getMemoryHistory('mem_legacy999');
  assert.strictEqual(legacyHistory.length, 1);
  assert.strictEqual(legacyHistory[0].version, 1);

  // Cleanup
  fs.rmSync(tempVaultDir, { recursive: true, force: true });

  console.log('✅ ALL HARDENED MEMORY HISTORY TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Hardened Memory History Test Failed:', err);
  process.exit(1);
});
