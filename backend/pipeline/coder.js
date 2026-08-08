const logger = require("../utils/logger");

const askOpenRouter = require("../openrouter");

async function coder(data) {
  logger.info("Coder", "Menjana jawapan AI...");

  const {
    provider,
    model,
    question,
    history = [],
    system = "",
    sendStatus = () => {}
  } = data;

  sendStatus("AI sedang menjana jawapan...");

  try {
    let response;

    response = await askOpenRouter(question, {
      model,
      history,
      system
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
