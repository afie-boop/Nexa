const { learnFromChat } = require('./learning');
const { extractMemory } = require('./memory');
const { assessMemoryQuality } = require('./memory_quality');
const assert = require('assert');

function makeBrain(seed = []) {
  const rows = [...seed];
  return {
    rows,
    extractMemory: (i, o) => extractMemory(i, o),
    listMemories: async () => rows.slice(),
    saveMemory: async (m) => { const id = 'mem_' + rows.length; const r = { id, ...m, path: 'db://memory/' + id, version: 1 }; rows.push(r); return { created: true, path: r.path, memory: r }; },
    updateMemory: async (p, u) => { const r = rows.find(x => x.path === p); Object.assign(r, u, { version: (r.version || 1) + 1 }); return { path: p, version: r.version }; }
  };
}
const scope = { type: 'user', userId: 'guest_test' };
const opt = { mode: 'rules', consolidate: false };
const U = c => ({ role: 'user', content: c }), A = c => ({ role: 'assistant', content: c });

(async () => {
  // 1. Incomplete lead is NOT saved
  let b = makeBrain();
  let r = await learnFromChat(b, [U('Ingat, aku ada projek peribadi.')], scope, opt);
  assert.strictEqual(b.rows.length, 0); console.log('1 ok', r.skipped);

  // 2. Short answer completes it into one full fact
  r = await learnFromChat(b, [U('Ingat, aku ada projek peribadi.'), A('Apa nama projek itu?'), U('AXMchat')], scope, opt);
  assert.strictEqual(b.rows.length, 1);
  console.log('2 ok', b.rows[0].content);
  assert.match(b.rows[0].content, /AXMchat/);

  // 3. Same turn again => duplicate, no new row
  await learnFromChat(b, [U('Ingat, aku ada projek peribadi.'), A('Apa nama projek itu?'), U('AXMchat')], scope, opt);
  assert.strictEqual(b.rows.length, 1); console.log('3 ok duplicate ignored');

  // 4. Existing incomplete row from production is UPDATED, not duplicated
  b = makeBrain([{ id: 'mem_41c1a3fc582c', content: 'Aku ada projek peribadi.', type: 'project', category: 'project', path: 'db://memory/mem_41c1a3fc582c', version: 1, importance: 0.8 }]);
  r = await learnFromChat(b, [U('aku ada projek peribadi'), A('Apa nama projek itu?'), U('AXMchat')], scope, opt);
  assert.strictEqual(b.rows.length, 1); assert.match(b.rows[0].content, /AXMchat/); assert.strictEqual(b.rows[0].version, 2);
  console.log('4 ok updated ->', b.rows[0].content);

  // 5. Non-answer does not create a fact
  b = makeBrain();
  await learnFromChat(b, [U('aku ada projek peribadi'), A('Apa nama projek itu?'), U('entah')], scope, opt);
  assert.strictEqual(b.rows.length, 0); console.log('5 ok non-answer ignored');

  // 6. Old turn is not re-extracted when a later unrelated message arrives
  b = makeBrain();
  await learnFromChat(b, [U('aku ada projek peribadi'), A('Apa nama projek itu?'), U('cuaca panas hari ni')], scope, opt);
  assert.strictEqual(b.rows.length, 0); console.log('6 ok no stale re-extraction');

  // 7. Recall phrasing without punctuation is never stored as a fact
  b = makeBrain();
  await learnFromChat(b, [U('Kau boleh ingat tak nama project peribadi aku namanya AXMchat')], scope, opt);
  assert.strictEqual(b.rows.length, 0); console.log('7 ok recall question ignored');

  // 8. Contradiction on identity replaces old value
  b = makeBrain([{ id: 'm1', content: 'Nama saya Ali', type: 'fact', category: 'user', path: 'db://memory/m1', version: 1 }]);
  await learnFromChat(b, [U('Nama saya Abu')], scope, opt);
  assert.strictEqual(b.rows.length, 1); assert.match(b.rows[0].content, /Abu/); console.log('7 ok contradiction updated ->', b.rows[0].content);

  // 9. Sensitive info rejected by quality filter (was broken by regex escaping)
  for (const t of ['Kata laluan aku ialah abc123', 'No IC aku 900101-14-5566', 'Kad kredit aku 4111 1111 1111 1111', 'My password is hunter2']) {
    const q = assessMemoryQuality({ content: t, type: 'fact', confidence: 0.95, importance: 0.9 });
    assert.strictEqual(q.accepted, false, t); assert.strictEqual(q.reason, 'sensitive_information');
  }
  console.log('8 ok sensitive rejected');
  const ok = assessMemoryQuality({ content: 'Pengguna mempunyai projek peribadi bernama AXMchat.', type: 'project', confidence: 0.95, importance: 0.85 });
  assert.strictEqual(ok.accepted, true); console.log('9 ok normal fact accepted');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
