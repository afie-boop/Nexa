const { analyzeModelStats } = require("./analyzer");

/**
 * Generates an auto-ranked leaderboard of all active models in the system.
 *
 * @param {Object} db - The evolution database content.
 * @returns {Array} List of models ranked by their performance score.
 */
function generateLeaderboard(db) {
  const list = [];
  const providers = db.providers || {};

  for (const [providerName, models] of Object.entries(providers)) {
    for (const [modelName, tasks] of Object.entries(models)) {
      for (const [taskName, stats] of Object.entries(tasks)) {
        const analysis = analyzeModelStats(stats);
        list.push({
          provider: providerName,
          model: modelName,
          task: taskName,
          score: analysis.score,
          successRate: analysis.successRate,
          avgSpeed: analysis.avgSpeed,
          usageCount: analysis.usageCount
        });
      }
    }
  }

  // Sort descending by score, and then by successRate, and usageCount
  return list.sort((a, b) => b.score - a.score || b.successRate - a.successRate || b.usageCount - a.usageCount);
}

/**
 * Generates a comprehensive performance report for each model.
 *
 * @param {Object} db - The evolution database content.
 * @returns {Object} Report details per provider and model.
 */
function generateDailyReport(db) {
  const report = {};
  const providers = db.providers || {};

  for (const [providerName, models] of Object.entries(providers)) {
    report[providerName] = {};
    for (const [modelName, tasks] of Object.entries(models)) {
      report[providerName][modelName] = {};
      for (const [taskName, stats] of Object.entries(tasks)) {
        const analysis = analyzeModelStats(stats);

        let problems = "None";
        if (analysis.successRate < 70) {
          problems = "Low success rate (" + analysis.successRate + "%)";
        } else if (analysis.avgSpeed > 15) {
          problems = "High latency / High average speed (" + analysis.avgSpeed + "s)";
        }

        report[providerName][modelName][taskName] = {
          successRate: analysis.successRate + "%",
          avgSpeed: analysis.avgSpeed + " seconds",
          score: analysis.score,
          accuracy: analysis.accuracy + "%",
          problems
        };
      }
    }
  }

  return report;
}

/**
 * Analyzes model stability and generates recommendations for replacements if performance drops.
 *
 * Replacement criteria:
 *   - Success Rate < 70% or average latency / speed > 15s or high timeoutCount.
 *
 * @param {Object} db - The evolution database.
 * @returns {Array} List of recommendation objects.
 */
function getRecommendations(db) {
  const recommendations = [];
  const leaderboard = generateLeaderboard(db);

  // Group leaderboard models by task to easily find better alternatives
  const modelsByTask = {};
  leaderboard.forEach(item => {
    if (!modelsByTask[item.task]) {
      modelsByTask[item.task] = [];
    }
    modelsByTask[item.task].push(item);
  });

  const providers = db.providers || {};
  for (const [providerName, models] of Object.entries(providers)) {
    for (const [modelName, tasks] of Object.entries(models)) {
      for (const [taskName, stats] of Object.entries(tasks)) {
        const analysis = analyzeModelStats(stats);
        const hasHighTimeout = stats.timeoutCount > 15 || analysis.avgSpeed > 15;
        const hasLowSuccess = analysis.successRate < 70 && stats.usageCount >= 3; // ensure minimum usage for accuracy

        if (hasHighTimeout || hasLowSuccess) {
          // Look for the best model for the same task
          const alternatives = modelsByTask[taskName] || [];
          const bestAlternative = alternatives.find(alt => alt.model !== modelName && alt.score > analysis.score);

          if (bestAlternative) {
            let reason = "";
            if (hasHighTimeout) {
              reason = "High timeout (avg latency " + analysis.avgSpeed + "s)";
            } else {
              reason = "Low accuracy / success rate (" + analysis.successRate + "%)";
            }

            recommendations.push({
              replace: modelName,
              replaceProvider: providerName,
              with: bestAlternative.model,
              withProvider: bestAlternative.provider,
              task: taskName,
              reason: reason
            });
          }
        }
      }
    }
  }

  return recommendations;
}

module.exports = {
  generateLeaderboard,
  generateDailyReport,
  getRecommendations
};
