const logger = require("../utils/logger");\n\nconst QUALITY_RULES = `\nQUALITY STANDARD — ANTI-SLOP:\n- Fahami maksud sebenar pengguna dan jawab perkara yang diminta.\n- Beri isi yang spesifik dan berguna; elakkan pembuka kosong, pujian automatik, pengulangan dan kesimpulan klise.\n- Jangan reka fakta, angka, sumber, ciri atau tindakan. Nyatakan ketidakpastian dengan jujur.\n- Ikut bahasa, nada dan tahap perincian pengguna secara semula jadi.\n- Jangan tambah penerangan, tajuk atau senarai yang tidak membantu.\n- Jika maklumat penting tiada, tanya satu soalan yang paling perlu.\n`;

async function router(data) {
  logger.info("Router", "Memilih AI...");

  const {
    task,
    question,
    history = [],
    generalModel,
    codingModel,
    generalProvider = "openrouter",
    codingProvider = "openrouter",
    fallbackModel,
    internalSystemContext = "",
    sendStatus = () => {}
  } = data;

  sendStatus("Router memilih AI...");

  let provider, model;
  if (task === "code") {
    provider = codingProvider;
    model = codingModel || "openrouter/free";
  } else {
    provider = generalProvider;
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

  const resolvedFallbackModel = fallbackModel || null;

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
