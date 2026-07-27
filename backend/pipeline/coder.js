const logger = require("../utils/logger");

const askOpenRouter = require("../openrouter");
const askGroq = require("../groq");

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

    switch (provider) {
      case "groq":
        response = await askGroq(question, {
          model,
          history,
          system
        });
        break;

      case "openrouter":
      default:
        response = await askOpenRouter(question, {
          model,
          history,
          system
        });
        break;
    }

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
