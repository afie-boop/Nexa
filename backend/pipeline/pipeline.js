const logger = require("../utils/logger");

const router = require("./router");
const planner = require("./planner");
const coder = require("./coder");
const reviewer = require("./reviewer");
const validator = require("./validator");
const formatter = require("./formatter");

async function runPipeline(data) {

  logger.start(data.question);
  let currentModule = "";

  try {

    // ===========================
    // Router
    // ===========================

    currentModule = "Router";
    logger.moduleStart("Router");

    data = await router(data);

    logger.moduleSuccess("Router");

    logger.pipelineInfo({
      task: data.task,
      provider: data.provider,
      model: data.model
    });

    // ===========================
    // Planner
    // ===========================

    currentModule = "Planner";
    logger.moduleStart("Planner");

    data = await planner(data);

    logger.moduleSuccess("Planner");

    // ===========================
    // Coder
    // ===========================

    currentModule = "Coder";
    logger.moduleStart("Coder");

    data = await coder(data);

    logger.moduleSuccess(
      "Coder",
      `Response Length : ${data.response.length}`
    );

    // ===========================
    // Reviewer
    // ===========================

    currentModule = "Reviewer";
    logger.moduleStart("Reviewer");

    data = await reviewer(data);

    logger.moduleSuccess(
      "Reviewer",
      `Passed : ${data.review.passed}`
    );

    // ===========================
    // Validator
    // ===========================

    currentModule = "Validator";
    logger.moduleStart("Validator");

    data = await validator(data);

    logger.moduleSuccess(
      "Validator",
      `Valid : ${data.valid}`
    );

    if (!data.valid) {
      throw new Error(
        data.validation.join("\n") ||
        "Validation failed."
      );
    }

    // ===========================
    // Formatter
    // ===========================

    currentModule = "Formatter";
    logger.moduleStart("Formatter");

    const output = await formatter(data);

    logger.moduleSuccess("Formatter");

    logger.finish();

    return output;

  } catch (err) {

    if (currentModule) {
      logger.moduleFail(currentModule, err);
    }

    logger.error(err);

    throw err;

  }

}

module.exports = {
  runPipeline
};
