const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Brain, retrieveContext } = require('./brain');

console.log('--- Running AXMchat Brain RAG Context Retrieval Tests ---');

async function runTests() {
  // 1. Test Empty Vault & Empty Query
  console.log('Testing Empty Vault & Empty Query...');
  const tempEmptyVault = path.join(__dirname, 'test_temp_empty_retrieval');
  if (fs.existsSync(tempEmptyVault)) {
    fs.rmSync(tempEmptyVault, { recursive: true, force: true });
  }
  fs.mkdirSync(tempEmptyVault, { recursive: true });

  const emptyBrain = new Brain(tempEmptyVault);
  const emptyRes = await emptyBrain.retrieveContext('query');
  assert.strictEqual(emptyRes.results.length, 0);
  assert.ok(emptyRes.context.includes('No relevant context found'));

  const emptyQueryRes = await emptyBrain.retrieveContext('');
  assert.strictEqual(emptyQueryRes.results.length, 0);

  fs.rmSync(tempEmptyVault, { recursive: true, force: true });

  // 2. Setup Test Vault for Graph Chain: Note A -> [[Note B]], Note B -> [[Note C]], Note C -> [[Note D]]
  console.log('Setting up Graph Fixture Vault (Note A -> Note B -> Note C -> Note D)...');
  const tempVaultDir = path.join(__dirname, 'test_temp_retrieval_graph_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(tempVaultDir, 'Knowledge'), { recursive: true });
  fs.mkdirSync(path.join(tempVaultDir, 'Projects'), { recursive: true });

  const noteAPath = path.join(tempVaultDir, 'Knowledge', 'NoteA.md');
  const noteBPath = path.join(tempVaultDir, 'Knowledge', 'NoteB.md');
  const noteCPath = path.join(tempVaultDir, 'Projects', 'NoteC.md');
  const noteDPath = path.join(tempVaultDir, 'Projects', 'NoteD.md');
  const noteUnrelatedPath = path.join(tempVaultDir, 'Projects', 'Unrelated.md');

  // Note A contains query term 'Spesifik' and links to Note B
  fs.writeFileSync(
    noteAPath,
    `---
title: Note A
---
Kandungan Spesifik utama A dengan pautan [[Knowledge/NoteB]].`
  );

  // Note B links to Note C
  fs.writeFileSync(
    noteBPath,
    `---
title: Note B
---
Kandungan pertengahan B dengan pautan [[Projects/NoteC]].`
  );

  // Note C links to Note D
  fs.writeFileSync(
    noteCPath,
    `---
title: Note C
---
Kandungan pertengahan C dengan pautan [[Projects/NoteD]].`
  );

  // Note D
  fs.writeFileSync(
    noteDPath,
    `---
title: Note D
---
Kandungan hujung D.`
  );

  // Unrelated note
  fs.writeFileSync(
    noteUnrelatedPath,
    `---
title: Unrelated
---
Kandungan terasing tanpa pautan.`
  );

  const mockEmbedder = async (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('spesifik')) {
      return [0.95, 0.05, 0.0];
    }
    return [0.0, 0.1, 0.8];
  };

  const brain = new Brain(tempVaultDir);
  const options = { customEmbedder: mockEmbedder, topK: 1, graphLimit: 2, maxSources: 10 };

  // 3. Test Graph-aware Retrieval
  console.log('Testing Graph Expansion & Source Tracking...');
  const graphRes = await brain.retrieveContext('Spesifik', options);

  console.log('Retrieved Graph Sources:', graphRes.sources.map(s => ({ path: s.path, score: s.score, types: s.sourceTypes })));

  // Note A should be primary result
  assert.strictEqual(graphRes.sources[0].path, 'Knowledge/NoteA.md');
  assert.ok(graphRes.sources[0].sourceTypes.includes('fulltext'));

  // Note B should be discovered via Graph / WikiLink
  const noteBSource = graphRes.sources.find(s => s.path === 'Knowledge/NoteB.md');
  assert.ok(noteBSource, 'Note B should be discovered via graph/wikilink expansion');
  assert.ok(noteBSource.sourceTypes.some(t => t === 'graph' || t === 'wikilink'));

  // Verify Graph Score is lower than primary result score
  assert.ok(noteBSource.score < graphRes.sources[0].score, 'Graph score should be lower than primary score');

  // Verify Unrelated note is NOT included
  const unrelatedSource = graphRes.sources.find(s => s.path === 'Projects/Unrelated.md');
  assert.strictEqual(unrelatedSource, undefined, 'Unrelated note should not enter context');

  // 4. Test Graph Limit Constraint
  console.log('Testing graphLimit Constraint...');
  const limitedGraphRes = await brain.retrieveContext('Spesifik', { ...options, graphLimit: 0 });
  const graphTypeSources = limitedGraphRes.sources.filter(s => s.sourceTypes.includes('graph'));
  assert.strictEqual(graphTypeSources.length, 0, 'No graph sources should be added when graphLimit is 0');

  // 5. Test Duplicate Prevention & Formatting
  console.log('Testing Context Formatting...');
  assert.ok(graphRes.context.includes('=== USER QUERY ==='));
  assert.ok(graphRes.context.includes('=== RETRIEVED CONTEXT ==='));
  assert.ok(graphRes.context.includes('=== SOURCES ==='));

  // Verify duplicate prevention in paths
  const paths = graphRes.sources.map(s => s.path);
  const uniquePaths = Array.from(new Set(paths));
  assert.strictEqual(paths.length, uniquePaths.length, 'No duplicate note paths in sources');

  // 6. Test Graceful Fallback on Semantic Failure
  console.log('Testing Fallback on Semantic Failure...');
  const failingEmbedderOptions = {
    customEmbedder: async () => {
      throw new Error('API Key Missing / Service Down');
    }
  };

  const fallbackRes = await brain.retrieveContext('Spesifik', failingEmbedderOptions);
  assert.ok(fallbackRes.sources.length > 0);
  assert.strictEqual(fallbackRes.sources[0].path, 'Knowledge/NoteA.md');

  // 7. Security Path Traversal Test
  console.log('Testing Security Path Traversal Protection...');
  const securityRes = await brain.retrieveContext('../../etc/passwd', options);
  assert.ok(!securityRes.context.includes('root:x:'));

  // Cleanup
  fs.rmSync(tempVaultDir, { recursive: true, force: true });

  console.log('✅ ALL RAG CONTEXT RETRIEVAL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Retrieval Test Failed:', err);
  process.exit(1);
});
