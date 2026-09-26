const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  Brain,
  parseWikiLinks,
  getOutgoingLinks,
  resolveNotePath,
  getBacklinks
} = require('./brain');

console.log('--- Running AXMchat Brain WikiLinks & Backlinks Tests ---');

// 1. Test WikiLinks Parsing
const sampleContent = `
Ini adalah nota contoh dengan [[Nama Note]].
Juga mengandungi link dengan folder [[Knowledge/Teknologi AI]] dan alias [[Projects/Nexa|Projek Utama]].
Di sini ada lagi link duplicate [[Nama Note]] dan [[Knowledge/Teknologi AI|Teknologi]].
`;

const links = parseWikiLinks(sampleContent);
console.log('Parsed links count:', links.length);
assert.strictEqual(links.length, 5);
assert.strictEqual(links[0].target, 'Nama Note');
assert.strictEqual(links[0].alias, 'Nama Note');
assert.strictEqual(links[1].target, 'Knowledge/Teknologi AI');
assert.strictEqual(links[2].target, 'Projects/Nexa');
assert.strictEqual(links[2].alias, 'Projek Utama');

// 2. Test Outgoing Links & Duplicate Prevention
const outgoing = getOutgoingLinks(sampleContent);
console.log('Unique outgoing links:', outgoing);
assert.strictEqual(outgoing.length, 3);
assert.deepStrictEqual(outgoing, ['Nama Note', 'Knowledge/Teknologi AI', 'Projects/Nexa']);

// 3. Test Vault setup & Security Path Traversal
const tempVaultDir = path.join(__dirname, 'test_temp_vault');
if (fs.existsSync(tempVaultDir)) {
  fs.rmSync(tempVaultDir, { recursive: true, force: true });
}

fs.mkdirSync(path.join(tempVaultDir, 'Knowledge'), { recursive: true });
fs.mkdirSync(path.join(tempVaultDir, 'Projects'), { recursive: true });

// Create test notes
const note1Path = path.join(tempVaultDir, 'Knowledge', 'Teknologi.md');
const note2Path = path.join(tempVaultDir, 'Projects', 'AI_Model.md');

fs.writeFileSync(note1Path, 'Rujukan kepada [[Projects/AI_Model|Model AI]] dan [[Nota Rahsia]].');
fs.writeFileSync(note2Path, 'Maklumat lanjut di [[Knowledge/Teknologi]].');

const brain = new Brain(tempVaultDir);

// Test Path Traversal Security
console.log('Testing Path Traversal Security...');
assert.throws(() => {
  resolveNotePath(tempVaultDir, '../../../etc/passwd');
}, /Security Violation/);

assert.throws(() => {
  brain.resolveNotePath('../server.js');
}, /Security Violation/);

// Test Note Resolution
const resolvedAIModel = brain.resolveNotePath('Projects/AI_Model');
assert.strictEqual(resolvedAIModel, path.resolve(note2Path));

// Test Backlinks Discovery
console.log('Testing Backlinks Discovery...');
const backlinksForAIModel = brain.getBacklinks('Projects/AI_Model');
console.log('Backlinks for AI_Model:', backlinksForAIModel.map(b => b.relativePath));
assert.strictEqual(backlinksForAIModel.length, 1);
assert.strictEqual(backlinksForAIModel[0].relativePath, path.join('Knowledge', 'Teknologi.md'));

const backlinksForTeknologi = brain.getBacklinks('Knowledge/Teknologi');
console.log('Backlinks for Teknologi:', backlinksForTeknologi.map(b => b.relativePath));
assert.strictEqual(backlinksForTeknologi.length, 1);
assert.strictEqual(backlinksForTeknologi[0].relativePath, path.join('Projects', 'AI_Model.md'));

// Cleanup temp test vault
fs.rmSync(tempVaultDir, { recursive: true, force: true });

console.log('✅ ALL WIKILINKS & BACKLINKS TESTS PASSED SUCCESSFULLY!');
