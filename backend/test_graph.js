const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Brain, buildGraph } = require('./brain');

console.log('--- Running AXMchat Brain Graph Builder Tests ---');

// 1. Test Empty Vault
const tempEmptyVault = path.join(__dirname, 'test_temp_empty_vault');
if (fs.existsSync(tempEmptyVault)) {
  fs.rmSync(tempEmptyVault, { recursive: true, force: true });
}
fs.mkdirSync(tempEmptyVault, { recursive: true });

const emptyBrain = new Brain(tempEmptyVault);
const emptyGraph = emptyBrain.buildGraph();
console.log('Empty Vault Graph:', emptyGraph);
assert.deepStrictEqual(emptyGraph, { nodes: [], edges: [] });
fs.rmSync(tempEmptyVault, { recursive: true, force: true });

// 2. Test Node Generation, WikiLink Edges, Self-Links, Folder Note Resolution, Duplicate Prevention
const tempVaultDir = path.join(__dirname, 'test_temp_graph_vault');
if (fs.existsSync(tempVaultDir)) {
  fs.rmSync(tempVaultDir, { recursive: true, force: true });
}

fs.mkdirSync(path.join(tempVaultDir, 'Knowledge'), { recursive: true });
fs.mkdirSync(path.join(tempVaultDir, 'Projects'), { recursive: true });

const note1 = path.join(tempVaultDir, 'Knowledge', 'AI.md');
const note2 = path.join(tempVaultDir, 'Projects', 'App.md');
const note3 = path.join(tempVaultDir, 'Projects', 'Self.md');

// Note 1 links to Note 2 and includes a duplicate link to Note 2
fs.writeFileSync(
  note1,
  `---
title: Kecerdasan Buatan
tags: ["ai", "tech"]
---
Lihat projek [[Projects/App]] dan [[Projects/App|Projek Aplikasi]].`
);

// Note 2 links to Note 1
fs.writeFileSync(
  note2,
  `---
title: Aplikasi Utama
tags: ["project"]
---
Berdasarkan [[Knowledge/AI]].`
);

// Note 3 links to itself (self-link) and links to Note 2
fs.writeFileSync(
  note3,
  `---
title: Self Note
---
Pautan diri sendiri [[Projects/Self]] dan ke [[Projects/App]].`
);

const brain = new Brain(tempVaultDir);
const graph = brain.buildGraph();

console.log('Generated Nodes Count:', graph.nodes.length);
console.log('Generated Edges Count:', graph.edges.length);

// Assert Nodes
assert.strictEqual(graph.nodes.length, 3);
const nodeIds = graph.nodes.map(n => n.id);
assert.ok(nodeIds.includes('Knowledge/AI.md'));
assert.ok(nodeIds.includes('Projects/App.md'));
assert.ok(nodeIds.includes('Projects/Self.md'));

const aiNode = graph.nodes.find(n => n.id === 'Knowledge/AI.md');
assert.strictEqual(aiNode.name, 'Kecerdasan Buatan');
assert.ok(aiNode.tags.includes('#ai'));
assert.ok(aiNode.tags.includes('#tech'));

// Assert Edges
// Expected edges:
// Knowledge/AI.md -> Projects/App.md (1 edge, duplicates filtered)
// Projects/App.md -> Knowledge/AI.md
// Projects/Self.md -> Projects/App.md (Self-link to Projects/Self.md excluded!)
console.log('Edges:', graph.edges);
assert.strictEqual(graph.edges.length, 3);

// Verify no self-links exist
const selfLinks = graph.edges.filter(e => e.source === e.target);
assert.strictEqual(selfLinks.length, 0);

// Verify edge connections
const hasAItoApp = graph.edges.some(e => e.source === 'Knowledge/AI.md' && e.target === 'Projects/App.md');
const hasAppToAI = graph.edges.some(e => e.source === 'Projects/App.md' && e.target === 'Knowledge/AI.md');
const hasSelfToApp = graph.edges.some(e => e.source === 'Projects/Self.md' && e.target === 'Projects/App.md');

assert.ok(hasAItoApp, 'Missing Knowledge/AI.md -> Projects/App.md edge');
assert.ok(hasAppToAI, 'Missing Projects/App.md -> Knowledge/AI.md edge');
assert.ok(hasSelfToApp, 'Missing Projects/Self.md -> Projects/App.md edge');

// 3. Test Graph Rebuild on Note Modification
fs.writeFileSync(
  note1,
  `---
title: Kecerdasan Buatan Baru
---
Hapus pautan.`
);

const updatedGraph = brain.buildGraph();
const updatedAiNode = updatedGraph.nodes.find(n => n.id === 'Knowledge/AI.md');
assert.strictEqual(updatedAiNode.name, 'Kecerdasan Buatan Baru');

// Edge Knowledge/AI.md -> Projects/App.md should be gone
const hasAItoAppUpdated = updatedGraph.edges.some(e => e.source === 'Knowledge/AI.md' && e.target === 'Projects/App.md');
assert.strictEqual(hasAItoAppUpdated, false);

// Clean up
fs.rmSync(tempVaultDir, { recursive: true, force: true });

console.log('✅ ALL GRAPH BUILDER TESTS PASSED SUCCESSFULLY!');
