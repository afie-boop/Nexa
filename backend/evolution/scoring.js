/**
 * Calculates the updated evolution score based on execution metrics.
 *
 * Formula rules:
 *   +3 Successful request
 *   +2 Reviewer Passed
 *   +2 Validator Passed
 *   +1 Fast response (< 2.0 seconds execution time)
 *   -5 Timeout
 *   -5 Empty response
 *   -8 Validation Failed
 *   -10 AI Crash
 *
 * Score bounds: [0, 100]
 *
 * @param {number} currentScore - The model's current score [0-100].
 * @param {Object} metrics - Request execution metrics.
 * @param {boolean} metrics.success - Did the request execute successfully.
 * @param {boolean} metrics.reviewerPassed - Did the reviewer pass.
 * @param {boolean} metrics.validatorPassed - Did the validator pass.
 * @param {number} metrics.executionTime - Execution time in seconds.
 * @param {boolean} metrics.timeout - Did the request timeout.
 * @param {boolean} metrics.emptyResponse - Was the response empty.
 * @param {boolean} metrics.validationFailed - Did the validation check fail.
 * @param {boolean} metrics.crash - Did the request crash/throw an error.
 * @returns {number} The newly calculated score, bounded between 0 and 100.
 */
function calculateNewScore(currentScore, metrics) {
  let delta = 0;

  if (metrics.success) {
    delta += 3;
  }
  if (metrics.reviewerPassed) {
    delta += 2;
  }
  if (metrics.validatorPassed) {
    delta += 2;
  }
  if (metrics.success && metrics.executionTime < 2.0) {
    delta += 1;
  }
  if (metrics.timeout) {
    delta -= 5;
  }
  if (metrics.emptyResponse) {
    delta -= 5;
  }
  if (metrics.validationFailed) {
    delta -= 8;
  }
  if (metrics.crash) {
    delta -= 10;
  }

  const newScore = Math.min(100, Math.max(0, currentScore + delta));
  return newScore;
}

module.exports = {
  calculateNewScore
};
