const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  Brain,
  sanitizeScopeId,
  normalizeScope,
  getScopeDirectory,
  isNoteInScope
} = require('./brain');

console.log('--- Running AXMchat Brain Memory Scoping Tests ---');

async function runTests() {
  const tempVaultDir = path.join(__dirname, 'test_temp_scoping_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempVaultDir, { recursive: true });

  const brain = new Brain(tempVaultDir);

  // 1. Path Traversal & Unsafe ID Sanitization Tests
  console.log('Testing Path Traversal & Unsafe ID Sanitization...');
  assert.throws(() => sanitizeScopeId('../user1'), /Security Violation/);
  assert.throws(() => sanitizeScopeId('user/1'), /Security Violation/);
  assert.throws(() => sanitizeScopeId('user:1'), /Security Violation/);
  assert.throws(() => sanitizeScopeId('user@123!'), /invalid characters/);
  assert.strictEqual(sanitizeScopeId('user_123'), 'user_123');

  // 2. Scope Normalization & Directory Layout Tests
  console.log('Testing Scope Normalization & Directory Layout...');
  const userScope = normalizeScope({ type: 'user', userId: 'userA' });
  assert.strictEqual(userScope.type, 'user');
  assert.strictEqual(userScope.userId, 'userA');
  assert.strictEqual(getScopeDirectory(userScope), 'Users/userA');

  const projScope = normalizeScope({ type: 'project', projectId: 'projX', userId: 'userA' });
  assert.strictEqual(projScope.type, 'project');
  assert.strictEqual(projScope.projectId, 'projX');
  assert.strictEqual(getScopeDirectory(projScope), 'Projects/projX');

  const sessionScope = normalizeScope({ type: 'session', sessionId: 'sess123' });
  assert.strictEqual(getScopeDirectory(sessionScope), 'Memory/Sessions/sess123');

  // 3. User Scope Isolation (User A cannot retrieve User B's memory)
  console.log('Testing User Scope Isolation...');
  const memUserA = { content: 'User A rahsia peribadi' };
  const memUserB = { content: 'User B rahsia peribadi' };

  await brain.saveMemory(memUserA, { scope: { type: 'user', userId: 'userA' } });
  await brain.saveMemory(memUserB, { scope: { type: 'user', userId: 'userB' } });

  const userASearch = await brain.retrieveContext('rahsia', { scope: { type: 'user', userId: 'userA' } });
  console.log('User A Search Results:', userASearch.sources.map(s => s.path));
  assert.strictEqual(userASearch.sources.length, 1);
  assert.ok(userASearch.sources[0].path.startsWith('Users/userA/'));

  const userBSearch = await brain.retrieveContext('rahsia', { scope: { type: 'user', userId: 'userB' } });
  assert.strictEqual(userBSearch.sources.length, 1);
  assert.ok(userBSearch.sources[0].path.startsWith('Users/userB/'));

  // 4. Project Scope Isolation (Project A vs Project B)
  console.log('Testing Project Scope Isolation...');
  await brain.saveMemory({ content: 'Projek A rahsia pautan' }, { scope: { type: 'project', projectId: 'projA' } });
  await brain.saveMemory({ content: 'Projek B rahsia pautan' }, { scope: { type: 'project', projectId: 'projB' } });

  const projASearch = await brain.retrieveContext('rahsia', { scope: { type: 'project', projectId: 'projA' } });
  assert.strictEqual(projASearch.sources.length, 1);
  assert.ok(projASearch.sources[0].path.startsWith('Projects/projA/'));

  // 5. Session Scope Isolation
  console.log('Testing Session Scope Isolation...');
  await brain.saveMemory({ content: 'Sesi A perbualan' }, { scope: { type: 'session', sessionId: 'sessA' } });
  await brain.saveMemory({ content: 'Sesi B perbualan' }, { scope: { type: 'session', sessionId: 'sessB' } });

  const sessASearch = await brain.retrieveContext('perbualan', { scope: { type: 'session', sessionId: 'sessA' } });
  assert.strictEqual(sessASearch.sources.length, 1);
  assert.ok(sessASearch.sources[0].path.startsWith('Memory/Sessions/sessA/'));

  // 6. Global Knowledge Availability
  console.log('Testing Global Knowledge Scope...');
  await brain.saveMemory({ content: 'Knowledge am rahsia' }, { scope: { type: 'knowledge' } });

  const globalSearchUserA = await brain.retrieveContext('rahsia', { scope: { type: 'user', userId: 'userA' } });
  // Should see User A's private memory + Global Knowledge
  assert.strictEqual(globalSearchUserA.sources.length, 2);

  // 7. Missing Scope Does NOT Expose Private Scoped Memories
  console.log('Testing Missing Scope Protection...');
  const unscopedSearch = await brain.retrieveContext('rahsia'); // No scope filter
  console.log('Unscoped Search Results:', unscopedSearch.sources.map(s => s.path));
  // Must only contain global Knowledge, not User A, User B, Project A, or Project B private notes!
  assert.strictEqual(unscopedSearch.sources.length, 1);
  assert.ok(unscopedSearch.sources[0].path.includes('Knowledge/'));

  // 8. Legacy / Unscoped Memory Readability
  console.log('Testing Legacy Unscoped Memory Readability...');
  const legacyNotePath = path.join(tempVaultDir, 'Knowledge', 'LegacyNote.md');
  fs.writeFileSync(
    legacyNotePath,
    `---
title: Legacy Note
---
Ini nota warisan rahsia tanpa metadata scope.`
  );

  const legacySearch = await brain.retrieveContext('warisan', { scope: { type: 'user', userId: 'userA' } });
  assert.strictEqual(legacySearch.sources.length, 1);
  assert.strictEqual(legacySearch.sources[0].path, 'Knowledge/LegacyNote.md');

  // 9. Duplicate Detection Respects Scope
  console.log('Testing Duplicate Detection Respects Scope...');
  const dupContent = { content: 'Sama kandungan tetapi berbeza scope' };

  const saveA = await brain.saveMemory(dupContent, { scope: { type: 'user', userId: 'userA' } });
  const saveB = await brain.saveMemory(dupContent, { scope: { type: 'user', userId: 'userB' } });

  assert.strictEqual(saveA.created, true);
  assert.strictEqual(saveB.created, true); // Same content saved independently in userB scope!

  const dupAAgain = await brain.saveMemory(dupContent, { scope: { type: 'user', userId: 'userA' } });
  assert.strictEqual(dupAAgain.created, false);
  assert.strictEqual(dupAAgain.duplicate, true); // Reject duplicate inside userA scope!

  // 10. Graph Expansion Respects Scope Isolation Boundaries
  console.log('Testing Graph Expansion Scope Boundary Enforcement...');
  const noteAUserA = path.join(tempVaultDir, 'Users', 'userA', 'GraphNodeA.md');
  const noteBUserB = path.join(tempVaultDir, 'Users', 'userB', 'GraphNodeB.md');

  fs.writeFileSync(
    noteAUserA,
    `---
title: Graph Node A
scopeType: user
userId: userA
---
Nota A dengan pautan [[Users/userB/GraphNodeB]].`
  );

  fs.writeFileSync(
    noteBUserB,
    `---
title: Graph Node B
scopeType: user
userId: userB
---
Nota B rahsia User B.`
  );

  const graphUserASearch = await brain.retrieveContext('Graph Node A', { scope: { type: 'user', userId: 'userA' } });
  // Note B from User B must NOT be pulled into User A's context via Graph expansion!
  const graphUserBInContext = graphUserASearch.sources.find(s => s.path.includes('userB'));
  assert.strictEqual(graphUserBInContext, undefined, 'Graph expansion must not cross user scope boundary');

  // Cleanup
  fs.rmSync(tempVaultDir, { recursive: true, force: true });

  console.log('✅ ALL MEMORY SCOPING TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Memory Scoping Test Failed:', err);
  process.exit(1);
});
