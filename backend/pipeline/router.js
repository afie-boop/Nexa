const logger = require("../utils/logger");
const { retrieveRelevantMemories } = require("../feedback/memoryRetriever");

async function router(data) {
  logger.info("Router", "Memilih AI...");

  const {
    task,
    question,
    history = [],
    generalModel,
    codingModel,
    fallbackModel,
    sendStatus = () => {}
  } = data;

  sendStatus("Router memilih AI...");

  let provider, model;
  if (task === "code") {
    provider = "openrouter";
    model = codingModel || "openrouter/free";
  } else {
    provider = "openrouter";
    model = generalModel || "qwen/qwen3-235b-a22b-2507";
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

  // Retrieve relevant feedback memories / lessons / preferences
  const memories = retrieveRelevantMemories(question);
  if (memories.warningPrompt) {
    logger.info("Router", "Memori kesalahan lampau / keutamaan ditemui. Menyuntik ke dalam prompt sistem.");
    system += `\n\nSila ambil perhatian tentang arahan tambahan daripada sejarah maklum balas pengguna ini:\n${memories.warningPrompt}\n`;
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
    fallbackModel: fallbackModel || "openrouter/free",
    system,
    retrievedMemories: memories
  };
}

module.exports = router;
