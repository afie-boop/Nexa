const logger = require("../utils/logger");
const { getBestModelForTask } = require("../evolution/engine");

async function router(data) {
  logger.info("Router", "Memilih AI...");

  const {
    task,
    question,
    history = [],
    sendStatus = () => {}
  } = data;

  sendStatus("Router memilih AI...");

  const modelChoice = getBestModelForTask(task === "code" ? "coding" : "general");
  const provider = modelChoice.provider;
  const model = modelChoice.model;
  let system;

  if (task === "code") {
    system = `
Kamu ialah AI Coding Nexa.

Peraturan:
- Berikan code lengkap.
- Jangan ringkaskan code.
- Jangan ubah bahagian yang tidak diminta.
- Jika membaiki bug, baiki bug sahaja.
- Jangan beri penerangan panjang.
`;
  } else {
    system = `
Kamu ialah Nexa AI Assistant.

Jawab dengan jelas dan padat.
Gunakan Bahasa Melayu atau Indonesia mengikut pengguna.
`;
  }

  if (data.evoStrategies && data.evoStrategies.length > 0) {
    system += `\n\nSISTEM STRATEGI AKTIF (EVOLVED):\n` + data.evoStrategies.map(s => `- ${s}`).join("\n");
  }

  logger.success(
    "Router",
    `${provider} | ${model}`
  );

  return {
    ...data,
    question,
    history,
    provider,
    model,
    system
  };
}

module.exports = router;
