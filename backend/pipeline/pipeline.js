const logger = require("../utils/logger");

const router = require("./router");
const planner = require("./planner");
const coder = require("./coder");
const reviewer = require("./reviewer");
const validator = require("./validator");
const formatter = require("./formatter");

async function runPipeline(data) {
  const startTime = Date.now();
  let chosenProvider = null;
  let chosenModel = null;
  let taskCategory = data ? data.task : "general";

  logger.start(data.question);
  let currentModule = "";

  const emitStep = data.sendProcessStep || (() => {});

  try {
    emitStep({ id: "analyze_request", label: "Analyzing request", status: "active" });

    // ===========================
    // Router
    // ===========================

    currentModule = "Router";
    logger.moduleStart("Router");

    data = await router(data);
    chosenProvider = data.provider;
    chosenModel = data.model;
    taskCategory = data.task;

    logger.moduleSuccess("Router");
    emitStep({ id: "analyze_request", label: "Analyzing request", status: "completed" });

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
    emitStep({ id: "generate_response", label: "Generating response", status: "active" });

    data = await coder(data);

    logger.moduleSuccess(
      "Coder",
      `Response Length : ${data.response.length}`
    );
    emitStep({ id: "generate_response", label: "Generating response", status: "completed" });

    // ===========================
    // Reviewer
    // ===========================

    currentModule = "Reviewer";
    logger.moduleStart("Reviewer");
    emitStep({ id: "review_response", label: "Reviewing response", status: "active" });

    data = await reviewer(data);

    logger.moduleSuccess(
      "Reviewer",
      `Passed : ${data.review.passed}`
    );
    emitStep({ id: "review_response", label: "Reviewing response", status: "completed" });

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
    emitStep({ id: "completed", label: "Completed", status: "completed" });

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
