const logger = require("../utils/logger");

async function router(data) {
  logger.info("Router", "Memilih AI...");

  const {
    task,
    question,
    history = [],
    sendStatus = () => {}
  } = data;

  sendStatus("Router memilih AI...");

  let provider, model;
  if (task === "code") {
    provider = "openrouter";
    model = "openrouter/free";
  } else {
    provider = "openrouter";
    model = "qwen/qwen3-235b-a22b:free";
  }
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
