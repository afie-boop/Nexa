const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  Brain,
  parseFrontmatter,
  parseInlineTags,
  getNoteTags,
  findNotesByTag
} = require('./brain');

console.log('--- Running AXMchat Brain Tags & Properties Tests ---');

// 1. Test YAML Frontmatter Parsing
const noteWithYAML = `---
title: Akses Memori AI
tags:
  - axmchat
  - memory
type: note
created: 2025-05-10
updated: 2025-05-12
---

Ini nota perbualan #axmchat dan juga projek #project/backend.
`;

const { frontmatter, body } = parseFrontmatter(noteWithYAML);
console.log('Parsed Frontmatter:', frontmatter);
assert.strictEqual(frontmatter.title, 'Akses Memori AI');
assert.strictEqual(frontmatter.type, 'note');
assert.deepStrictEqual(frontmatter.tags, ['axmchat', 'memory']);

// 2. Test Combined Tags (YAML + Inline) & Duplicate Prevention
const allTags = getNoteTags(noteWithYAML);
console.log('Combined Note Tags:', allTags);
assert.strictEqual(allTags.length, 3);
assert.ok(allTags.includes('#axmchat'));
assert.ok(allTags.includes('#memory'));
assert.ok(allTags.includes('#project/backend'));

// 3. Test Inline Tag Extraction
const inlineTags = parseInlineTags('Bincang isu #axmchat dan #memory bersama komuniti.');
assert.deepStrictEqual(inlineTags, ['#axmchat', '#memory']);

// 4. Test Search Notes By Tag with Vault Traversal
const tempVaultDir = path.join(__dirname, 'test_temp_vault_properties');
if (fs.existsSync(tempVaultDir)) {
  fs.rmSync(tempVaultDir, { recursive: true, force: true });
}

fs.mkdirSync(path.join(tempVaultDir, 'Memory'), { recursive: true });
fs.mkdirSync(path.join(tempVaultDir, 'Projects'), { recursive: true });

const note1 = path.join(tempVaultDir, 'Memory', 'Sesi1.md');
const note2 = path.join(tempVaultDir, 'Projects', 'P1.md');

fs.writeFileSync(
  note1,
  `---
title: Sesi 1
tags: ["axmchat", "memory"]
type: memory
---
Kandungan memori.`
);

fs.writeFileSync(
  note2,
  `---
title: Projek AXM
tags: project
---
Kandungan projek dengan hashtag #axmchat di hujung.`
);

const brain = new Brain(tempVaultDir);

// Search by tag #axmchat (should find both note1 and note2)
const axmchatNotes = brain.findNotesByTag('#axmchat');
console.log('Notes matching #axmchat:', axmchatNotes.map(n => n.relativePath));
assert.strictEqual(axmchatNotes.length, 2);

// Search by tag #memory (should find note1 only)
const memoryNotes = brain.findNotesByTag('memory');
console.log('Notes matching #memory:', memoryNotes.map(n => n.relativePath));
assert.strictEqual(memoryNotes.length, 1);
assert.strictEqual(memoryNotes[0].relativePath, path.join('Memory', 'Sesi1.md'));

// Clean up
fs.rmSync(tempVaultDir, { recursive: true, force: true });

console.log('✅ ALL TAGS & YAML PROPERTIES TESTS PASSED SUCCESSFULLY!');
