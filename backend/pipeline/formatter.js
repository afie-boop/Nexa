const logger = require("../utils/logger");

async function formatter(data) {
  logger.info("Formatter", "Memformat jawapan...");

  const {
    response,
    sendStatus = () => {}
  } = data;

  sendStatus("Formatter sedang menyusun jawapan...");

  let output = response || "";

  output = output.trim();

  logger.success("Formatter", "Jawapan siap diformat.");

  return output;
}

module.exports = formatter;
