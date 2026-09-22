const logger = require("../utils/logger");

async function reviewer(data) {
  logger.info("Reviewer", "Menyemak hasil AI...");

  const { response, sendStatus = () => {} } = data;

  sendStatus("Reviewer sedang menyemak...");

  const issues = [];

  if (!response || !response.trim()) {
    issues.push("AI tidak menghasilkan jawapan.");
  }

  logger.success(
    "Reviewer",
    issues.length
      ? `${issues.length} isu ditemui.`
      : "Tiada isu ditemui."
  );

  return {
    ...data,
    review: {
      passed: issues.length === 0,
      issues
    }
  };
}

module.exports = reviewer;
