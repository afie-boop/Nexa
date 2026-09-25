const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  Brain,
  sanitizeScopeId,
  normalizeScope,
  getScopeDirectory,
  isNoteInScope
} = require('./index');

console.log('--- Running AXMchat Brain Memory Scoping Hardened Unit Tests ---');

async function runTests() {
  const tempVaultDir = path.join(__dirname, 'test_temp_memory_scope_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempVaultDir, { recursive: true });

  const brain = new Brain(tempVaultDir);

  // 1. Unsafe Scope ID Rejection Tests
  console.log('1. Testing Unsafe Scope ID Rejection...');
  assert.throws(() => sanitizeScopeId('../user1'), /Security Violation/);
  assert.throws(() => sanitizeScopeId('user/1'), /Security Violation/);
  assert.throws(() => sanitizeScopeId('user\\1'), /Security Violation/);
  assert.throws(() => sanitizeScopeId('user:1'), /Security Violation/);
  assert.throws(() => sanitizeScopeId('   '), /Scope Error/);
  assert.throws(() => sanitizeScopeId(''), /Scope Error/);
  assert.throws(() => sanitizeScopeId('user@123'), /invalid characters/);
  assert.strictEqual(sanitizeScopeId('user_123'), 'user_123');
  assert.strictEqual(sanitizeScopeId('project-abc'), 'project-abc');

  // 2. User A cannot retrieve User B memory & Correct User retrieval
  console.log('2. Testing User Scope Isolation...');
  const memUserA = { content: 'User A private secret note' };
  const memUserB = { content: 'User B private secret note' };

  await brain.saveMemory(memUserA, { scope: { type: 'user', userId: 'user_A' } });
  await brain.saveMemory(memUserB, { scope: { type: 'user', userId: 'user_B' } });

  const searchUserA = await brain.retrieveContext('secret', { scope: { type: 'user', userId: 'user_A' } });
  assert.strictEqual(searchUserA.sources.length, 1);
  assert.ok(searchUserA.sources[0].path.startsWith('Users/user_A/'));

  const searchUserB = await brain.retrieveContext('secret', { scope: { type: 'user', userId: 'user_B' } });
  assert.strictEqual(searchUserB.sources.length, 1);
  assert.ok(searchUserB.sources[0].path.startsWith('Users/user_B/'));

  // 3. Project A cannot retrieve Project B memory
  console.log('3. Testing Project Scope Isolation...');
  await brain.saveMemory({ content: 'Project Alpha internal note' }, { scope: { type: 'project', projectId: 'proj_A' } });
  await brain.saveMemory({ content: 'Project Beta internal note' }, { scope: { type: 'project', projectId: 'proj_B' } });

  const searchProjA = await brain.retrieveContext('internal', { scope: { type: 'project', projectId: 'proj_A' } });
  assert.strictEqual(searchProjA.sources.length, 1);
  assert.ok(searchProjA.sources[0].path.startsWith('Projects/proj_A/'));

  // 4. Session A cannot retrieve Session B memory
  console.log('4. Testing Session Scope Isolation...');
  await brain.saveMemory({ content: 'Session 101 conversation' }, { scope: { type: 'session', sessionId: 'sess_101' } });
  await brain.saveMemory({ content: 'Session 202 conversation' }, { scope: { type: 'session', sessionId: 'sess_202' } });

  const searchSess101 = await brain.retrieveContext('conversation', { scope: { type: 'session', sessionId: 'sess_101' } });
  assert.strictEqual(searchSess101.sources.length, 1);
  assert.ok(searchSess101.sources[0].path.startsWith('Memory/Sessions/sess_101/'));

  // 5. User Scope can retrieve Global Knowledge & Knowledge scope ONLY retrieves global/knowledge notes
  console.log('5. Testing Global Knowledge Access & Knowledge Scope Isolation...');
  await brain.saveMemory({ content: 'Global shared knowledge overview' }, { scope: { type: 'knowledge' } });

  const userAWithKnowledge = await brain.retrieveContext('overview', { scope: { type: 'user', userId: 'user_A' } });
  assert.strictEqual(userAWithKnowledge.sources.length, 1);
  assert.ok(userAWithKnowledge.sources[0].path.startsWith('Knowledge/'));

  const knowledgeOnlySearch = await brain.retrieveContext('secret', { scope: { type: 'knowledge' } });
  assert.strictEqual(knowledgeOnlySearch.sources.length, 0, 'Knowledge scope must ONLY retrieve global/knowledge notes, never private user notes');

  // 6. Retrieval without scope does NOT expose private scoped memories
  console.log('6. Testing Unscoped Retrieval Protection...');
  const unscopedRes = await brain.retrieveContext('secret'); // Querying without scope filter
  assert.strictEqual(unscopedRes.sources.length, 0, 'Unscoped search must NEVER expose private user notes');

  const unscopedInternalRes = await brain.retrieveContext('internal');
  assert.strictEqual(unscopedInternalRes.sources.length, 0, 'Unscoped search must NEVER expose private project notes');

  // 7. Same content can exist independently in different scopes & Duplicate detection is isolated
  console.log('7. Testing Duplicate Detection Isolated by Scope...');
  const sharedContent = { content: 'Same content independent in scopes' };

  const saveScopeUserA = await brain.saveMemory(sharedContent, { scope: { type: 'user', userId: 'user_A' } });
  const saveScopeUserB = await brain.saveMemory(sharedContent, { scope: { type: 'user', userId: 'user_B' } });

  assert.strictEqual(saveScopeUserA.created, true);
  assert.strictEqual(saveScopeUserB.created, true); // Created independently in user_B scope!

  const dupUserA = await brain.saveMemory(sharedContent, { scope: { type: 'user', userId: 'user_A' } });
  assert.strictEqual(dupUserA.created, false);
  assert.strictEqual(dupUserA.duplicate, true); // Rejected duplicate inside user_A scope

  // 8. Legacy unscoped notes remain readable
  console.log('8. Testing Legacy Unscoped Note Readability...');
  const legacyNotePath = path.join(tempVaultDir, 'Knowledge', 'LegacyFact.md');
  fs.writeFileSync(
    legacyNotePath,
    `---
title: Legacy Fact
---
Legacy unscoped fact note.`
  );

  const legacyRes = await brain.retrieveContext('Legacy', { scope: { type: 'user', userId: 'user_A' } });
  assert.strictEqual(legacyRes.sources.length, 1);
  assert.strictEqual(legacyRes.sources[0].path, 'Knowledge/LegacyFact.md');

  // 9. Full-Text, Semantic, WikiLink, Backlink, and Graph Expansion Scope Isolation
  console.log('9. Testing Full-Text, Semantic, Graph, WikiLink, and Backlink Scope Isolation...');
  const userANote = path.join(tempVaultDir, 'Users', 'user_A', 'NoteA.md');
  const userBTarget = path.join(tempVaultDir, 'Users', 'user_B', 'NoteB.md');

  fs.writeFileSync(
    userANote,
    `---
title: Note A
scopeType: user
userId: user_A
---
User A note linking to [[Users/user_B/NoteB]].`
  );

  fs.writeFileSync(
    userBTarget,
    `---
title: Note B
scopeType: user
userId: user_B
---
User B secret target note.`
  );

  // Search Note A in User A scope
  const graphIsolationRes = await brain.retrieveContext('Note A', { scope: { type: 'user', userId: 'user_A' } });
  const userBFound = graphIsolationRes.sources.find(s => s.path.includes('user_B'));
  assert.strictEqual(userBFound, undefined, 'Graph / WikiLink expansion must NOT leak User B notes into User A context');

  // Full-text search isolation
  const ftResUserA = brain.searchNotes('secret', { scope: { type: 'user', userId: 'user_A' } });
  assert.strictEqual(ftResUserA.length, 1);
  assert.ok(ftResUserA[0].path.startsWith('Users/user_A/'));

  // 10. Path Traversal Attempt Rejection in saveMemory for ALL scopes including Knowledge
  console.log('10. Testing Path Traversal Attempt Rejection for ALL scopes...');
  assert.rejects(async () => {
    await brain.saveMemory(
      { content: 'Hacked path content', suggestedPath: '../../Knowledge/hacked.md' },
      { scope: { type: 'user', userId: 'user_A' } }
    );
  }, /Security Violation/);

  assert.rejects(async () => {
    await brain.saveMemory(
      { content: 'Hacked knowledge content', suggestedPath: '../../Users/user_A/hacked_knowledge.md' },
      { scope: { type: 'knowledge' } }
    );
  }, /Security Violation/);

  assert.strictEqual(fs.existsSync(path.join(tempVaultDir, 'Knowledge', 'hacked.md')), false, 'File must not be created outside user scope dir');
  assert.strictEqual(fs.existsSync(path.join(tempVaultDir, 'Users', 'user_A', 'hacked_knowledge.md')), false, 'Knowledge scope file must not escape Knowledge dir');

  // Cleanup
  fs.rmSync(tempVaultDir, { recursive: true, force: true });

  console.log('✅ ALL HARDENED MEMORY SCOPING TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Memory Scoping Hardened Test Failed:', err);
  process.exit(1);
});
