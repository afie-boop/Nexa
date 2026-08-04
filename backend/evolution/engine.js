const { readDatabase, writeDatabase, createEmptyStats } = require("./database");
const { calculateNewScore } = require("./scoring");
const { generateLeaderboard, generateDailyReport, getRecommendations } = require("./reporter");

/**
 * Retrieves the best performing model for a specific task based on evolution scores.
 * Uses a safe fallback if there are no records in the database.
 *
 * Future providers can be added simply by adding them to database.json under the respective task.
 *
 * @param {string} task - The task category ('coding' or 'general').
 * @returns {Object} An object containing the chosen { provider, model }.
 */
function getBestModelForTask(task) {
  const db = readDatabase();
  const leaderboard = generateLeaderboard(db);

  // Filter leaderboard models by requested task
  const candidates = leaderboard.filter(item => item.task === task);

  if (candidates.length > 0) {
    // Return the top-scoring candidate
    const best = candidates[0];
    return {
      provider: best.provider,
      model: best.model
    };
  }

  // Fallback defaults if no statistics exist for the task category
  if (task === "coding") {
    return {
      provider: "openrouter",
      model: "inclusionai/ling-3.0-flash:free"
    };
  } else {
    return {
      provider: "groq",
      model: "openai/gpt-oss-120b"
    };
  }
}

/**
 * Records execution telemetry metrics for an AI request and updates the dynamic scores.
 *
 * Ensures thread-safe structure initialization for any new pluggable providers or models.
 *
 * @param {string} provider - The AI provider name (e.g. 'groq', 'openrouter').
 * @param {string} model - The AI model identifier.
 * @param {string} task - The task category ('coding' or 'general').
 * @param {Object} metrics - Request execution telemetry.
 * @param {number} metrics.startTime - Start epoch timestamp.
 * @param {number} metrics.finishTime - Finish epoch timestamp.
 * @param {number} metrics.executionTime - Total execution time in seconds.
 * @param {boolean} metrics.success - Flag indicating whether the response succeeded.
 * @param {boolean} metrics.failure - Flag indicating whether the response failed/erred.
 * @param {boolean} metrics.validationResult - Did validation pass successfully.
 * @param {boolean} metrics.reviewerResult - Did the reviewer pass successfully.
 * @param {number} [metrics.tokenCount=0] - Number of tokens consumed, if available.
 * @param {boolean} metrics.timeout - Did the request hit a timeout.
 * @param {boolean} metrics.emptyResponse - Was the response body empty.
 * @param {boolean} metrics.crash - Did an unexpected error/crash occur during execution.
 */
function recordRequest(provider, model, task, metrics) {
  const db = readDatabase();

  // Clean parameters to ensure safe key accesses
  const pName = String(provider).toLowerCase();
  const mName = String(model);
  const tName = String(task).toLowerCase() === "code" ? "coding" : "general";

  if (!db.providers) {
    db.providers = {};
  }
  if (!db.providers[pName]) {
    db.providers[pName] = {};
  }
  if (!db.providers[pName][mName]) {
    db.providers[pName][mName] = {};
  }
  if (!db.providers[pName][mName][tName]) {
    db.providers[pName][mName][tName] = createEmptyStats();
  }

  const stats = db.providers[pName][mName][tName];

  // Update request counts
  stats.usageCount = (stats.usageCount || 0) + 1;
  if (metrics.success) {
    stats.success = (stats.success || 0) + 1;
  }
  if (metrics.failure || metrics.crash) {
    stats.failed = (stats.failed || 0) + 1;
  }

  // Update specific counters
  if (metrics.timeout) {
    stats.timeoutCount = (stats.timeoutCount || 0) + 1;
  }
  if (metrics.emptyResponse) {
    stats.emptyResponseCount = (stats.emptyResponseCount || 0) + 1;
  }
  if (!metrics.validationResult) {
    stats.validationFailedCount = (stats.validationFailedCount || 0) + 1;
  }
  if (metrics.crash) {
    stats.crashCount = (stats.crashCount || 0) + 1;
  }
  if (metrics.reviewerResult) {
    stats.reviewerPassCount = (stats.reviewerPassCount || 0) + 1;
  }
  if (metrics.validationResult) {
    stats.validatorPassCount = (stats.validatorPassCount || 0) + 1;
  }

  // Calculate run-time moving averages
  const duration = metrics.executionTime || 0;
  stats.totalExecutionTime = (stats.totalExecutionTime || 0) + duration;
  stats.avgSpeed = stats.totalExecutionTime / stats.usageCount;

  const tokens = metrics.tokenCount || 0;
  if (tokens > 0) {
    stats.totalTokens = (stats.totalTokens || 0) + tokens;
    stats.avgTokens = stats.totalTokens / stats.usageCount;
  }

  // Calculate new score with the scoring engine
  const scoreMetrics = {
    success: !!metrics.success,
    reviewerPassed: !!metrics.reviewerResult,
    validatorPassed: !!metrics.validationResult,
    executionTime: duration,
    timeout: !!metrics.timeout,
    emptyResponse: !!metrics.emptyResponse,
    validationFailed: !metrics.validationResult,
    crash: !!metrics.crash
  };

  stats.score = calculateNewScore(stats.score || 100, scoreMetrics);

  writeDatabase(db);
}

/**
 * Compiles a comprehensive state report containing rankings, model metrics, and recommendations.
 *
 * @returns {Object} Complete evolution report object.
 */
function getSystemStatus() {
  const db = readDatabase();
  return {
    leaderboard: generateLeaderboard(db),
    dailyReport: generateDailyReport(db),
    recommendations: getRecommendations(db)
  };
}

module.exports = {
  getBestModelForTask,
  recordRequest,
  getSystemStatus
};
