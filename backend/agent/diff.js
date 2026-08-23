const fs = require("fs");
const { resolveWorkspacePath } = require("./workspace");

function generateDiff(filePath, newContent) {
  let oldContent = "";
  try {
    const absPath = resolveWorkspacePath(filePath);
    if (fs.existsSync(absPath)) {
      oldContent = fs.readFileSync(absPath, "utf-8");
    }
  } catch {
    oldContent = "";
  }

  const oldLines = oldContent ? oldContent.split("\n") : [];
  const newLines = newContent ? newContent.split("\n") : [];

  const diffResult = [];

  // Simple clean diff line generator
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      // Unchanged line (context limit: keep minimal)
      diffResult.push(`  ${newLines[j]}`);
      i++;
      j++;
    } else if (j < newLines.length && (!oldLines.includes(newLines[j], i))) {
      diffResult.push(`+ ${newLines[j]}`);
      j++;
    } else if (i < oldLines.length) {
      diffResult.push(`- ${oldLines[i]}`);
      i++;
    } else {
      diffResult.push(`+ ${newLines[j]}`);
      j++;
    }
  }

  return diffResult.join("\n");
}

module.exports = {
  generateDiff
};
