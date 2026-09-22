// backend/pipeline/planner.js

const logger = require("../utils/logger");

async function planner(data) {
  logger.info("Planner", "Membina pelan kerja...");

  const { task, question, sendStatus = () => {} } = data;

  sendStatus("Planner sedang menyusun langkah...");

  let steps = [];

  if (task === "code") {
    steps = [
      "Analyze Request",
      "Understand Context",
      "Generate Code",
      "Review Code",
      "Validate Output",
      "Format Response"
    ];
  } else {
    steps = [
      "Understand Question",
      "Collect Context",
      "Generate Answer",
      "Review Answer",
      "Format Response"
    ];
  }

  logger.success(
    "Planner",
    `${steps.length} langkah disediakan.`
  );

  return {
    ...data,
    plan: {
      task,
      question,
      createdAt: new Date().toISOString(),
      steps
    }
  };
}

module.exports = planner;
