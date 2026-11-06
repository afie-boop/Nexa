const logger = require("../utils/logger");

const { askProvider } = require("../providers");

async function coder(data) {
  logger.info("Coder", "Menjana jawapan AI...");

  const {
    provider = "openrouter",
    model,
    fallbackModel,
    question,
    history = [],
    system = "",
    maxTokens,
    reasoningEffort,
    maxRetries,
    fallbackEnabled,
    onUsage,
    sendStatus = () => {}
  } = data;

  sendStatus("AI sedang menjana jawapan...");

  try {
    let response;

    response = await askProvider(provider, question, {
      model,
      history,
      system,
      maxTokens,
      reasoningEffort,
      maxRetries,
      onUsage
    });

    if (!response || !response.trim()) {
      throw new Error("AI tidak memberikan jawapan.");
    }

    logger.success("Coder", "Jawapan AI diterima.");

    return {
      ...data,
      response
    };

  } catch (err) {
    throw err;
  }
}

module.exports = coder;
