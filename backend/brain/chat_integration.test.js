const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { retrieveContext } = require('./retrieval');

function writeNote(vaultDir, relativePath, frontmatter, body) {
  const filePath = path.join(vaultDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  fs.writeFileSync(filePath, `---\n${yaml}\n---\n\n${body}\n`, 'utf8');
}

test('chat Brain retrieval includes global knowledge and excludes another user', async () => {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axmchat-brain-chat-'));

  try {
    writeNote(vaultDir, 'Knowledge/shared.md', { title: 'Shared Knowledge' },
      'AXMchat uses a purple send icon and a simple flat interface.');

    writeNote(vaultDir, 'Users/alice/private.md', {
      title: 'Alice Memory',
      scopeType: 'user',
      userId: 'alice'
    }, 'Alice prefers concise Malay replies.');

    writeNote(vaultDir, 'Users/bob/private.md', {
      title: 'Bob Memory',
      scopeType: 'user',
      userId: 'bob'
    }, 'Bob prefers long English replies.');

    const result = await retrieveContext(vaultDir, 'preferences and AXMchat interface', {
      scope: { type: 'user', userId: 'alice' },
      topK: 5,
      maxSources: 10,
      maxContextChars: 5000
    });

    const paths = result.sources.map(source => source.path);
    assert(paths.includes('Knowledge/shared.md'));
    assert(paths.includes('Users/alice/private.md'));
    assert(!paths.includes('Users/bob/private.md'));
    assert(!result.context.includes('Bob prefers long English replies.'));
  } finally {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

test('chat Brain retrieval remains safe without authentication', async () => {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axmchat-brain-chat-anon-'));

  try {
    writeNote(vaultDir, 'Knowledge/shared.md', { title: 'Shared Knowledge' },
      'Global AXMchat documentation.');
    writeNote(vaultDir, 'Users/alice/private.md', {
      title: 'Alice Memory',
      scopeType: 'user',
      userId: 'alice'
    }, 'Alice secret memory.');

    const result = await retrieveContext(vaultDir, 'AXMchat memory', {
      scope: null,
      topK: 5,
      maxSources: 10,
      maxContextChars: 5000
    });

    const paths = result.sources.map(source => source.path);
    assert(paths.includes('Knowledge/shared.md'));
    assert(!paths.includes('Users/alice/private.md'));
    assert(!result.context.includes('Alice secret memory.'));
  } finally {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

test('server chat contract retrieves Brain context without modifying pipeline ownership', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.equal((server.match(/app\.post\("\/chat"/g) || []).length, 1);
  assert.equal((server.match(/runPipeline\(/g) || []).length, 1);
  assert(server.includes('brain.retrieveContext(question.trim()'));
  assert(server.includes('question: brainAugmentedQuestion'));
  assert(server.includes('require("./pipeline/pipeline")'));
});
