/**
 * Computes deep analytics for a given model stats block.
 *
 * Tracks:
 *   - Success Rate
 *   - Failure Rate
 *   - Average Speed
 *   - Average Tokens
 *   - Average Score
 *   - Usage Count
 *   - Accuracy (Coding Accuracy or General Accuracy depending on task)
 *   - Reviewer Pass Rate
 *   - Validator Pass Rate
 *
 * @param {Object} stats - The historical statistics object from database.json.
 * @returns {Object} Analytical metrics.
 */
function analyzeModelStats(stats) {
  const usageCount = stats.usageCount || 0;
  if (usageCount === 0) {
    return {
      successRate: 100,
      failureRate: 0,
      avgSpeed: 0,
      avgTokens: 0,
      score: stats.score || 100,
      usageCount: 0,
      accuracy: 100,
      reviewerPassRate: 100,
      validatorPassRate: 100
    };
  }

  const successRate = ((stats.success / usageCount) * 100);
  const failureRate = ((stats.failed / usageCount) * 100);
  const avgSpeed = stats.avgSpeed || 0;
  const avgTokens = stats.avgTokens || 0;
  const score = stats.score || 100;

  // Reviewer pass rate & Validator pass rate
  const reviewerPassRate = ((stats.reviewerPassCount / usageCount) * 100);
  const validatorPassRate = ((stats.validatorPassCount / usageCount) * 100);

  // Accuracy: Defined as successful validation passes of the total requests
  const accuracy = ((stats.validatorPassCount / usageCount) * 100);

  return {
    successRate: parseFloat(successRate.toFixed(1)),
    failureRate: parseFloat(failureRate.toFixed(1)),
    avgSpeed: parseFloat(avgSpeed.toFixed(2)),
    avgTokens: parseFloat(avgTokens.toFixed(1)),
    score: parseFloat(score.toFixed(1)),
    usageCount,
    accuracy: parseFloat(accuracy.toFixed(1)),
    reviewerPassRate: parseFloat(reviewerPassRate.toFixed(1)),
    validatorPassRate: parseFloat(validatorPassRate.toFixed(1))
  };
}

module.exports = {
  analyzeModelStats
};
