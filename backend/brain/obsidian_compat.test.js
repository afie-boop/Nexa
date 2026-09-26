const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  normalizeWikiLink,
  getNoteCompatibility,
  scanVaultCompatibility
} = require('./obsidian_compat');

test('Obsidian WikiLink normalization preserves aliases and blocks traversal', () => {
  assert.equal(normalizeWikiLink('Projects/AXMchat'), '[[Projects/AXMchat]]');
  assert.equal(normalizeWikiLink('Projects/AXMchat', 'AXMchat project'), '[[Projects/AXMchat|AXMchat project]]');
  assert.throws(() => normalizeWikiLink('../secret'), /Security Violation/);
});

test('Obsidian compatibility reads YAML, tags, and WikiLinks from normal Markdown', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'axmchat-obsidian-'));

  try {
    fs.mkdirSync(path.join(vault, 'Knowledge'), { recursive: true });
    fs.writeFileSync(
      path.join(vault, 'Knowledge', 'AXMchat.md'),
      '---\ntitle: AXMchat\ntags:\n  - ai\n---\n# AXMchat\n\nSee [[Knowledge/Brain]] and #second-brain.',
      'utf8'
    );

    const note = getNoteCompatibility(vault, 'Knowledge/AXMchat.md');
    assert.equal(note.title, 'AXMchat');
    assert.deepEqual(note.frontmatter.tags, ['ai']);
    assert(note.tags.includes('#ai'));
    assert(note.tags.includes('#second-brain'));
    assert.equal(note.wikiLinks[0].target, 'Knowledge/Brain');
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('Obsidian compatibility scan ignores Brain history/index internals', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'axmchat-obsidian-scan-'));

  try {
    fs.mkdirSync(path.join(vault, 'Knowledge'), { recursive: true });
    fs.mkdirSync(path.join(vault, 'Memory', 'History'), { recursive: true });
    fs.mkdirSync(path.join(vault, '.index'), { recursive: true });

    fs.writeFileSync(path.join(vault, 'Knowledge', 'note.md'), '# note');
    fs.writeFileSync(path.join(vault, 'Memory', 'History', 'v1.md'), '# history');
    fs.writeFileSync(path.join(vault, '.index', 'vectors.md'), '# index');

    const result = scanVaultCompatibility(vault);
    assert.equal(result.compatible, true);
    assert.equal(result.noteCount, 1);
    assert.equal(result.notes[0].path, 'Knowledge/note.md');
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});
