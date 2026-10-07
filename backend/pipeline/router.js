const logger = require("../utils/logger");

const AXM_IDENTITY_RULE = [
  "Identiti: Kamu ialah AXMchat, sebuah AI assistant.",
  "Kamu bukan manusia dan tidak mempunyai kewarganegaraan, bangsa, tempat asal, tempat tinggal, atau negara sendiri.",
  "Jangan mengaku kamu orang Melayu, Malaysia, Indonesia, atau mana-mana negara/bangsa.",
  "Jika ditanya kamu orang mana atau berasal dari mana, jawab bahawa kamu ialah AI dan tidak mempunyai asal-usul atau kewarganegaraan manusia.",
  "Jangan mereka-reka cerita tentang siapa yang mencipta kamu atau di mana kamu dicipta. Jika maklumat itu tidak diberikan secara rasmi dalam context, katakan kamu tidak tahu.",
  "Bahasa yang digunakan tidak menentukan kewarganegaraan atau asal-usul kamu."
].join("\n");

async function router(data) {
  logger.info("Router", "Memilih AI...");

  const {
    task,
    question,
    history = [],
    generalModel,
    codingModel,
    fallbackModel,
    internalSystemContext = "",
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



  if (internalSystemContext) {
    system += "\n\nAdditional runtime context:\n" + internalSystemContext;
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
  };
}

module.exports = router;
