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

  // 2. Setup Test Vault with WikiLinks, Backlinks, Full-text, and Semantic notes
  console.log('Setting up test vault...');
  const tempVaultDir = path.join(__dirname, 'test_temp_retrieval_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(tempVaultDir, 'Knowledge'), { recursive: true });
  fs.mkdirSync(path.join(tempVaultDir, 'Projects'), { recursive: true });

  const noteA = path.join(tempVaultDir, 'Knowledge', 'Teknologi_AI.md');
  const noteB = path.join(tempVaultDir, 'Projects', 'Penyelidikan.md');
  const noteC = path.join(tempVaultDir, 'Knowledge', 'Kucing.md');

  // Note A: Full-text & Semantic match + WikiLink to Note B
  fs.writeFileSync(
    noteA,
    `---
title: Teknologi AI
tags: ["ai", "tech"]
---
Aplikasi kecerdasan buatan menggunakan model bahasa. Rujukan lanjut di [[Projects/Penyelidikan]].`
  );

  // Note B: Target of WikiLink from Note A (Backlink)
  fs.writeFileSync(
    noteB,
    `---
title: Penyelidikan
tags: ["research"]
---
Projek penyelidikan sistem RAG dan pautan kembali.`
  );

  // Note C: Semantic match only
  fs.writeFileSync(
    noteC,
    `---
title: Haiwan Comel
tags: ["cats"]
---
Kucing adalah haiwan peliharaan.`
  );

  // Mock embedder
  const mockEmbedder = async (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('kecerdasan') || lower.includes('ai') || lower.includes('model')) {
      return [0.9, 0.1, 0.0];
    }
    if (lower.includes('haiwan') || lower.includes('kucing')) {
      return [0.0, 0.9, 0.1];
    }
    return [0.1, 0.1, 0.8];
  };

  const options = { customEmbedder: mockEmbedder, topK: 5, maxSources: 5, maxContextChars: 2000 };
  const brain = new Brain(tempVaultDir);

  // 3. Test Hybrid Retrieval & Duplicate Removal
  console.log('Testing Hybrid Retrieval & Source Tracking...');
  const retrievalRes = await brain.retrieveContext('kecerdasan buatan', options);

  console.log('Retrieved Sources:', retrievalRes.sources.map(s => ({ path: s.path, types: s.sourceTypes })));
  assert.ok(retrievalRes.sources.length >= 2);

  // Verify Note A present with hybrid sourceTypes
  const noteASource = retrievalRes.sources.find(s => s.path === 'Knowledge/Teknologi_AI.md');
  assert.ok(noteASource);
  assert.ok(noteASource.sourceTypes.includes('fulltext'));
  assert.ok(noteASource.sourceTypes.includes('semantic'));

  // Verify Note B expanded via WikiLink/Backlink
  const noteBSource = retrievalRes.sources.find(s => s.path === 'Projects/Penyelidikan.md');
  assert.ok(noteBSource);
  assert.ok(noteBSource.sourceTypes.some(t => t === 'wikilink' || t === 'backlink'));

  // 4. Test Context Formatting and Source Tracking Header
  console.log('Testing Context Formatting...');
  assert.ok(retrievalRes.context.includes('=== USER QUERY ==='));
  assert.ok(retrievalRes.context.includes('=== RETRIEVED CONTEXT ==='));
  assert.ok(retrievalRes.context.includes('=== SOURCES ==='));
  assert.ok(retrievalRes.context.includes('Knowledge/Teknologi_AI.md'));

  // 5. Test maxSources and maxContextChars Truncation Limits
  console.log('Testing Truncation and Limits...');
  const limitedRes = await brain.retrieveContext('kecerdasan buatan', { ...options, maxSources: 1 });
  assert.strictEqual(limitedRes.sources.length, 1);

  const charLimitedRes = await brain.retrieveContext('kecerdasan buatan', { ...options, maxContextChars: 150 });
  assert.ok(charLimitedRes.context.length <= 500); // Context contains truncated content

  // 6. Test Semantic Failure Graceful Fallback
  console.log('Testing Graceful Fallback on Semantic Failure...');
  const failingEmbedderOptions = {
    customEmbedder: async () => {
      throw new Error('API Key Missing / Service Down');
    }
  };

  const fallbackRes = await brain.retrieveContext('kecerdasan buatan', failingEmbedderOptions);
  assert.ok(fallbackRes.sources.length > 0);
  assert.strictEqual(fallbackRes.sources[0].path, 'Knowledge/Teknologi_AI.md');
  assert.ok(fallbackRes.sources[0].sourceTypes.includes('fulltext'));

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
