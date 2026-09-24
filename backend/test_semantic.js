const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  Brain,
  cosineSimilarity,
  createEmbedding,
  createEmbeddings,
  semanticSearch
} = require('./brain');

console.log('--- Running AXMchat Brain Semantic / Vector Search Tests ---');

async function runTests() {
  // 1. Cosine Similarity & Embedding Abstraction Test
  console.log('Testing Cosine Similarity...');
  const v1 = [1, 0, 0];
  const v2 = [1, 0, 0];
  const v3 = [0, 1, 0];

  assert.strictEqual(cosineSimilarity(v1, v2), 1.0);
  assert.strictEqual(cosineSimilarity(v1, v3), 0.0);

  // Mock deterministic embedder for unit tests
  let embeddingCallCount = 0;
  const mockEmbedder = async (text) => {
    embeddingCallCount++;
    const lower = text.toLowerCase();
    if (lower.includes('kucing') || lower.includes('haiwan') || lower.includes('cat')) {
      return [0.9, 0.1, 0.0];
    }
    if (lower.includes('komputer') || lower.includes('kod') || lower.includes('software')) {
      return [0.0, 0.9, 0.1];
    }
    return [0.1, 0.1, 0.8];
  };

  const options = { customEmbedder: mockEmbedder };

  // Test embedding abstraction
  const emb1 = await createEmbedding('Kucing comel', options);
  assert.deepStrictEqual(emb1, [0.9, 0.1, 0.0]);

  const batchEmbs = await createEmbeddings(['Komputer riba', 'Kucing hitam'], options);
  assert.strictEqual(batchEmbs.length, 2);

  // 2. Empty Vault Test
  console.log('Testing Empty Vault...');
  const tempEmptyVault = path.join(__dirname, 'test_temp_empty_semantic');
  if (fs.existsSync(tempEmptyVault)) {
    fs.rmSync(tempEmptyVault, { recursive: true, force: true });
  }
  fs.mkdirSync(tempEmptyVault, { recursive: true });

  const emptyBrain = new Brain(tempEmptyVault);
  const emptyRes = await emptyBrain.semanticSearch('Kucing', options);
  assert.deepStrictEqual(emptyRes, []);
  fs.rmSync(tempEmptyVault, { recursive: true, force: true });

  // 3. Test Vault setup: Ranking, TopK, Threshold
  console.log('Testing Search Ranking, TopK, Threshold...');
  const tempVaultDir = path.join(__dirname, 'test_temp_semantic_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(tempVaultDir, 'Knowledge'), { recursive: true });
  fs.mkdirSync(path.join(tempVaultDir, 'Projects'), { recursive: true });

  const noteCat = path.join(tempVaultDir, 'Knowledge', 'Kucing.md');
  const noteCode = path.join(tempVaultDir, 'Projects', 'Komputer.md');

  fs.writeFileSync(noteCat, '# Nota Kucing\nHaiwan peliharaan comel.');
  fs.writeFileSync(noteCode, '# Nota Komputer\nMenulis kod software.');

  const brain = new Brain(tempVaultDir);

  // Reset counter
  embeddingCallCount = 0;

  // First search -> indexes 2 notes + 1 query = 3 embedding calls
  const catSearch = await brain.semanticSearch('Haiwan', { ...options, topK: 10 });
  console.log('Semantic Search for "Haiwan":', catSearch.map(r => ({ path: r.path, score: r.score.toFixed(2) })));
  assert.strictEqual(catSearch.length, 2);
  assert.strictEqual(catSearch[0].path, 'Knowledge/Kucing.md');
  assert.ok(catSearch[0].score > catSearch[1].score);

  // Verify vector index saved persistent in .index
  const indexFile = path.join(tempVaultDir, '.index', 'vector_index.json');
  assert.ok(fs.existsSync(indexFile));

  // 4. Unchanged Note Test (should not regenerate embedding)
  console.log('Testing Unchanged Note Caching...');
  const initialCallCount = embeddingCallCount; // Should be 3
  await brain.semanticSearch('Kod', options); // 1 query embed call only
  assert.strictEqual(embeddingCallCount, initialCallCount + 1);

  // 5. Changed Note Test (regenerates embedding)
  console.log('Testing Changed Note Embedding Regeneration...');
  fs.writeFileSync(noteCat, '# Nota Kucing\nHaiwan peliharaan comel yang suka tidur.');
  const beforeChangeCalls = embeddingCallCount;
  await brain.semanticSearch('Tidur', options);
  // Should re-embed modified noteCat + query = 2 calls
  assert.strictEqual(embeddingCallCount, beforeChangeCalls + 2);

  // 6. Deleted Note Test
  console.log('Testing Deleted Note Index Removal...');
  fs.unlinkSync(noteCode);
  const searchAfterDelete = await brain.semanticSearch('Komputer', options);
  const pathsAfterDelete = searchAfterDelete.map(r => r.path);
  assert.ok(!pathsAfterDelete.includes('Projects/Komputer.md'));

  // 7. Threshold & Empty Query Test
  console.log('Testing Threshold & Empty Query...');
  const highThresholdSearch = await brain.semanticSearch('Haiwan', { ...options, threshold: 0.999 });
  assert.ok(highThresholdSearch.length <= 1);

  const emptyQuerySearch = await brain.semanticSearch('', options);
  assert.deepStrictEqual(emptyQuerySearch, []);

  // 8. Corrupted Index Handling Test
  console.log('Testing Corrupted Index Handling...');
  fs.writeFileSync(indexFile, 'CORRUPTED JSON CONTENT {{{');
  // Should recover gracefully without crashing
  const corruptedIndexSearch = await brain.semanticSearch('Haiwan', options);
  assert.ok(Array.isArray(corruptedIndexSearch));

  // 9. Test Missing API Key Error Handling (without custom embedder)
  console.log('Testing Missing API Key Error Handling...');
  const oldEnv = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await createEmbedding('Test without key');
    assert.fail('Should have thrown error when no API key configured');
  } catch (err) {
    assert.ok(err.message.includes('No API key configured'));
  }
  process.env.OPENAI_API_KEY = oldEnv;

  // Cleanup
  fs.rmSync(tempVaultDir, { recursive: true, force: true });

  console.log('✅ ALL SEMANTIC / VECTOR SEARCH TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Semantic Search Test Failed:', err);
  process.exit(1);
});
