const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  Brain,
  extractMemory,
  findExistingMemory,
  saveMemory,
  updateMemory
} = require('./brain');

console.log('--- Running AXMchat Brain AI Memory Engine Tests ---');

async function runTests() {
  const tempVaultDir = path.join(__dirname, 'test_temp_memory_vault');
  if (fs.existsSync(tempVaultDir)) {
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempVaultDir, { recursive: true });

  const brain = new Brain(tempVaultDir);

  // 1. Test Memory Extraction (Preference, Fact, Goal, Ignoring Chatter)
  console.log('Testing Memory Extraction...');
  const sampleInput = `
User: Hello, hai! Apa khabar?
User: Saya suka guna React dan Tailwind CSS untuk frontend.
User: Nama saya Ahmad dan saya bekerja sebagai Software Engineer.
User: Matlamat saya mahu membina aplikasi RAG yang pintar.
User: Terima kasih, bye!
  `;

  const extracted = await brain.extractMemory(sampleInput);
  console.log('Extracted Memories Count:', extracted.memories.length);
  assert.strictEqual(extracted.memories.length, 3);

  const prefMem = extracted.memories.find(m => m.type === 'preference');
  assert.ok(prefMem);
  assert.ok(prefMem.content.includes('suka guna React'));
  assert.ok(prefMem.suggestedPath.startsWith('Users/'));

  const factMem = extracted.memories.find(m => m.type === 'fact');
  assert.ok(factMem);
  assert.ok(factMem.content.includes('Ahmad'));
  assert.ok(factMem.suggestedPath.startsWith('Users/'));

  const goalMem = extracted.memories.find(m => m.type === 'goal');
  assert.ok(goalMem);
  assert.ok(goalMem.content.includes('RAG'));
  assert.ok(goalMem.suggestedPath.startsWith('Projects/'));

  // 2. Test Confidence Threshold Filtering
  console.log('Testing Confidence Threshold Filtering...');
  const lowConfInput = `User: Saya tidak pasti.`;
  const lowConfExtracted = await brain.extractMemory(lowConfInput, { confidenceThreshold: 0.95 });
  assert.strictEqual(lowConfExtracted.memories.length, 0);

  // 3. Test Save New Memory
  console.log('Testing Save New Memory...');
  const saveRes = await brain.saveMemory(prefMem);
  console.log('Saved Memory Result:', saveRes);
  assert.strictEqual(saveRes.created, true);
  assert.ok(saveRes.path.startsWith('Users/'));
  assert.ok(fs.existsSync(path.join(tempVaultDir, saveRes.path)));

  // Verify Markdown & Frontmatter structure
  const rawSaved = fs.readFileSync(path.join(tempVaultDir, saveRes.path), 'utf-8');
  assert.ok(rawSaved.includes('---'));
  assert.ok(rawSaved.includes('type: preference'));
  assert.ok(rawSaved.includes('id: mem_'));

  // 4. Test Duplicate Save Prevention
  console.log('Testing Duplicate Save Prevention...');
  const dupSaveRes = await brain.saveMemory(prefMem);
  console.log('Duplicate Save Result:', dupSaveRes);
  assert.strictEqual(dupSaveRes.created, false);
  assert.strictEqual(dupSaveRes.duplicate, true);
  assert.strictEqual(dupSaveRes.path, saveRes.path);

  // 5. Test Find Existing Memory
  console.log('Testing Find Existing Memory...');
  const findRes = await brain.findExistingMemory(prefMem);
  assert.strictEqual(findRes.found, true);
  assert.strictEqual(findRes.path, saveRes.path);

  // 6. Test Safe Memory Update
  console.log('Testing Safe Memory Update...');
  const updateRes = await brain.updateMemory(saveRes.path, {
    content: 'Saya suka guna React, Tailwind CSS dan Next.js.',
    importance: 0.95
  });
  assert.strictEqual(updateRes.updated, true);
  assert.strictEqual(updateRes.frontmatter.importance, 0.95);

  const rawUpdated = fs.readFileSync(path.join(tempVaultDir, saveRes.path), 'utf-8');
  assert.ok(rawUpdated.includes('Next.js'));
  assert.strictEqual(rawUpdated.match(/---/g).length, 2); // Frontmatter intact

  // 7. Security Path Traversal Protection Test
  console.log('Testing Security Path Traversal Protection...');
  try {
    await brain.saveMemory({
      content: 'Malicious Content',
      suggestedPath: '../../etc/passwd.md'
    });
    assert.fail('Should throw path traversal security error');
  } catch (err) {
    assert.ok(err.message.includes('Security Violation'));
  }

  try {
    await brain.updateMemory('../../../server.js', { content: 'hacked' });
    assert.fail('Should throw path traversal security error');
  } catch (err) {
    assert.ok(err.message.includes('Security Violation'));
  }

  // 8. Test Invalid & Empty Input
  console.log('Testing Invalid & Empty Input...');
  const emptyExtracted = await brain.extractMemory('');
  assert.deepStrictEqual(emptyExtracted, { memories: [] });

  try {
    await brain.saveMemory({ content: ' ' });
    assert.fail('Should reject empty content');
  } catch (err) {
    assert.ok(err.message.includes('Memory content is required'));
  }

  // Cleanup
  fs.rmSync(tempVaultDir, { recursive: true, force: true });

  console.log('✅ ALL AI MEMORY ENGINE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Memory Test Failed:', err);
  process.exit(1);
});
