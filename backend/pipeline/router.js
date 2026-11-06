const logger = require("../utils/logger");

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
Peraturan:
- Berikan code lengkap.
- Jangan ringkaskan code.
- Jangan ubah bahagian yang tidak diminta.
- Jika membaiki bug, baiki bug sahaja.
- Jangan beri penerangan panjang.
`;
  } else {
    system = `
Jawab dengan jelas dan padat.
Gunakan Bahasa Melayu atau Indonesia mengikut pengguna.
`;
  }

  if (internalSystemContext) {
    system += "\n\nAdditional runtime context:\n" + internalSystemContext;
  }

  const fallbackCandidates = [fallbackModel, task === "code" ? generalModel : codingModel, generalModel, codingModel, "openrouter/free"]
    .map(value => String(value || "").trim())
    .filter((value, index, values) => value && value !== model && values.indexOf(value) === index);
  const resolvedFallbackModel = fallbackCandidates[0] || null;

  logger.success("Router", `${provider} | ${model}`);

  return {
    ...data,
    question,
    history,
    provider,
    model,
    fallbackModel: resolvedFallbackModel,
    system,
  };
}

module.exports = router;
