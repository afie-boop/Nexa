const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Brain, searchNotes } = require('./brain');

console.log('--- Running AXMchat Brain Full-Text Search Tests ---');

// 1. Test Empty Vault (Requirement 8)
const tempEmptyVault = path.join(__dirname, 'test_temp_empty_search_vault');
if (fs.existsSync(tempEmptyVault)) {
  fs.rmSync(tempEmptyVault, { recursive: true, force: true });
}
fs.mkdirSync(tempEmptyVault, { recursive: true });

const emptyBrain = new Brain(tempEmptyVault);
const emptyResults = emptyBrain.searchNotes('test');
console.log('Empty Vault Search Results:', emptyResults);
assert.deepStrictEqual(emptyResults, []);
fs.rmSync(tempEmptyVault, { recursive: true, force: true });

// Setup test vault with various notes
const tempVaultDir = path.join(__dirname, 'test_temp_search_vault');
if (fs.existsSync(tempVaultDir)) {
  fs.rmSync(tempVaultDir, { recursive: true, force: true });
}

fs.mkdirSync(path.join(tempVaultDir, 'Knowledge'), { recursive: true });
fs.mkdirSync(path.join(tempVaultDir, 'Projects'), { recursive: true });

const note1Path = path.join(tempVaultDir, 'Knowledge', 'Teknologi.md');
const note2Path = path.join(tempVaultDir, 'Projects', 'Aplikasi_Nexa.md');
const note3Path = path.join(tempVaultDir, 'Projects', 'Penyelidikan.md');

// Note 1: Title & Tag match
fs.writeFileSync(
  note1Path,
  `---
title: Teknologi AI Terkini
tags: ["ai", "teknologi"]
author: AXM
---
Ini nota ringkas tentang perisian pintar.`
);

// Note 2: Content match & Title match
fs.writeFileSync(
  note2Path,
  `---
title: Aplikasi Utama
tags: ["project"]
---
Aplikasi ini menggunakan teknologi AI untuk carian teks penuh secara pantas.`
);

// Note 3: Path match & Content match
fs.writeFileSync(
  note3Path,
  `---
title: Nota Penyelidikan
tags: ["research"]
---
Dokumen perancangan projek.`
);

const brain = new Brain(tempVaultDir);

// 2. Test Title Match (Requirement 2)
console.log('Testing Title Match...');
const titleResults = brain.searchNotes('Terkini');
assert.strictEqual(titleResults.length, 1);
assert.strictEqual(titleResults[0].name, 'Teknologi AI Terkini');
assert.ok(titleResults[0].matchedFields.includes('title'));

// 3. Test Content Match & Snippet Generation (Requirements 1 & 7)
console.log('Testing Content Match & Snippet Generation...');
const contentResults = brain.searchNotes('pantas');
assert.strictEqual(contentResults.length, 1);
assert.strictEqual(contentResults[0].name, 'Aplikasi Utama');
assert.ok(contentResults[0].matchedFields.includes('content'));
assert.ok(contentResults[0].snippet.toLowerCase().includes('pantas'));

// 4. Test Tag Match (Requirement 3)
console.log('Testing Tag Match...');
const tagResults = brain.searchNotes('teknologi');
assert.ok(tagResults.length >= 2);
const firstTagResult = tagResults.find(r => r.path === 'Knowledge/Teknologi.md');
assert.ok(firstTagResult.matchedFields.includes('tags'));

// 5. Test Path Match (Requirement 4)
console.log('Testing Path Match...');
const pathResults = brain.searchNotes('Knowledge');
assert.strictEqual(pathResults.length, 1);
assert.strictEqual(pathResults[0].path, 'Knowledge/Teknologi.md');
assert.ok(pathResults[0].matchedFields.includes('path'));

// 6. Test Multiple Search Terms & Relevance Ranking (Requirements 5 & 6)
console.log('Testing Multiple Terms & Relevance Ranking...');
const multiResults = brain.searchNotes('teknologi AI');
assert.ok(multiResults.length >= 2);
// Title & tag match in Note 1 should rank higher than content match in Note 2
assert.strictEqual(multiResults[0].path, 'Knowledge/Teknologi.md');
assert.ok(multiResults[0].score > multiResults[1].score);

// 7. Test No Result & Empty Query Handling (Requirement 9)
console.log('Testing No Result & Empty Query Handling...');
assert.deepStrictEqual(brain.searchNotes('nonexistent_keyword_xyz'), []);
assert.deepStrictEqual(brain.searchNotes(''), []);
assert.deepStrictEqual(brain.searchNotes('   '), []);

// 8. Test Duplicate Prevention (Requirement 10)
console.log('Testing Duplicate Prevention...');
const dupResults = brain.searchNotes('projek');
const paths = dupResults.map(r => r.path);
const uniquePaths = Array.from(new Set(paths));
assert.strictEqual(paths.length, uniquePaths.length);

// Cleanup
fs.rmSync(tempVaultDir, { recursive: true, force: true });

console.log('✅ ALL FULL-TEXT SEARCH TESTS PASSED SUCCESSFULLY!');
