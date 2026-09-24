const brain = require("./index");

console.log("=== AXMchat Brain Test ===");

brain.writeNote(
  "Knowledge/Test.md",
  `# AXMchat Brain Test

AXMchat mempunyai second brain berasaskan Markdown.

#axmchat #brain
`
);

console.log("✅ Note berjaya disimpan.");

const note = brain.readNote("Knowledge/Test.md");

console.log("\n📖 Isi note:");
console.log(note);

const results = brain.searchNotes("second brain");

console.log("\n🔎 Search result:");
console.log(results);

console.log("\n📚 Semua notes:");
console.log(brain.listNotes());

console.log("\n✅ Brain test selesai.");
