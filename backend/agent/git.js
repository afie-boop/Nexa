const { execSync } = require("child_process");
const { WORKSPACE_ROOT } = require("./workspace");

function git_status() {
  try {
    const output = execSync("git status --short", {
      cwd: WORKSPACE_ROOT,
      encoding: "utf-8",
      timeout: 10000
    });
    return output.trim() || "Tiada perubahan dikesan pada git status (Clean working tree).";
  } catch (err) {
    return `Error running git status: ${err.message}`;
  }
}

function git_diff() {
  try {
    const output = execSync("git diff", {
      cwd: WORKSPACE_ROOT,
      encoding: "utf-8",
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    return output.trim() || "Tiada perbezaan git (No git diff).";
  } catch (err) {
    return `Error running git diff: ${err.message}`;
  }
}

module.exports = {
  git_status,
  git_diff
};
