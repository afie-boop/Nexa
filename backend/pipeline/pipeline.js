const logger = require("../utils/logger");

const router = require("./router");
const planner = require("./planner");
const coder = require("./coder");
const reviewer = require("./reviewer");
const validator = require("./validator");
const formatter = require("./formatter");
const { recordRequest } = require("../evolution/engine");

async function runPipeline(data) {
  const startTime = Date.now();
  let chosenProvider = null;
  let chosenModel = null;
  let taskCategory = data ? data.task : "general";

  logger.start(data.question);
  let currentModule = "";

  try {

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

    // Record dynamic performance metrics on success
    const finishTime = Date.now();
    const duration = (finishTime - startTime) / 1000;
    recordRequest(data.provider, data.model, data.task, {
      startTime,
      finishTime,
      executionTime: duration,
      success: true,
      failure: false,
      validationResult: !!data.valid,
      reviewerResult: data.review ? !!data.review.passed : false,
      tokenCount: 0,
      timeout: false,
      emptyResponse: !data.response || !data.response.trim(),
      crash: false
    });

    logger.finish();

    return output;

  } catch (err) {

    if (currentModule) {
      logger.moduleFail(currentModule, err);
    }

    // Record metrics on exception/failure
    const finishTime = Date.now();
    const duration = (finishTime - startTime) / 1000;
    const isTimeout = err.message && (err.message.toLowerCase().includes("timeout") || err.message.toLowerCase().includes("etimedout"));
    const isEmpty = err.message && err.message.toLowerCase().includes("empty");
    const isValidationFail = err.message && (err.message.toLowerCase().includes("validation") || (data && data.valid === false));

    const prov = data && data.provider ? data.provider : (chosenProvider || "groq");
    const mod = data && data.model ? data.model : (chosenModel || "openai/gpt-oss-120b");
    const tsk = data && data.task ? data.task : (taskCategory || "general");

    recordRequest(prov, mod, tsk, {
      startTime,
      finishTime,
      executionTime: duration,
      success: false,
      failure: true,
      validationResult: data ? !!data.valid : false,
      reviewerResult: data && data.review ? !!data.review.passed : false,
      tokenCount: 0,
      timeout: isTimeout,
      emptyResponse: isEmpty,
      crash: !isValidationFail
    });

    logger.error(err);

    throw err;

  }

}

module.exports = {
  runPipeline
};
