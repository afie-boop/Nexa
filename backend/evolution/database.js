const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "database.json");

/**
 * Reads the evolution database.
 * If the file does not exist, it initializes it with the default template.
 * @returns {Object} The JSON database content.
 */
function readDatabase() {
  try {
    if (!fs.existsSync(dbPath)) {
      initializeDatabase();
    }
    const data = fs.readFileSync(dbPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Evolution DB Read Error:", error);
    // Return empty template if corrupt or unreadable
    return { providers: {} };
  }
}

/**
 * Writes data back to the evolution database.
 * Uses atomic style write to avoid corruption.
 * @param {Object} data - The updated database content.
 */
function writeDatabase(data) {
  try {
    const tempPath = dbPath + ".tmp";
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    console.error("Evolution DB Write Error:", error);
  }
}

/**
 * Initializes the database with default configuration.
 */
function initializeDatabase() {
  const defaultTemplate = {
    providers: {
      groq: {
        "openai/gpt-oss-120b": {
          general: createEmptyStats()
        },
        "llama-3.3-70b-versatile": {
          general: createEmptyStats()
        }
      },
      openrouter: {
        "inclusionai/ling-3.0-flash:free": {
          coding: createEmptyStats()
        },
        "tencent/hy3:free": {
          coding: createEmptyStats()
        }
      }
    }
  };
  fs.writeFileSync(dbPath, JSON.stringify(defaultTemplate, null, 2), "utf8");
}

/**
 * Helper to generate default/empty stats block for a task.
 * @returns {Object}
 */
function createEmptyStats() {
  return {
    success: 0,
    failed: 0,
    avgSpeed: 0,
    avgTokens: 0,
    score: 100,
    totalExecutionTime: 0,
    totalTokens: 0,
    usageCount: 0,
    timeoutCount: 0,
    emptyResponseCount: 0,
    validationFailedCount: 0,
    crashCount: 0,
    reviewerPassCount: 0,
    validatorPassCount: 0
  };
}

module.exports = {
  readDatabase,
  writeDatabase,
  createEmptyStats
};
