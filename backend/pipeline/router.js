const logger = require("../utils/logger");

const QUALITY_RULES = `
QUALITY STANDARD — ANTI-SLOP:
- Fahami maksud sebenar pengguna dan jawab perkara yang diminta.
- Beri isi yang spesifik dan berguna; elakkan pembuka kosong, pujian automatik, pengulangan dan kesimpulan klise.
- Jangan reka fakta, angka, sumber, ciri atau tindakan. Nyatakan ketidakpastian dengan jujur.
- Ikut bahasa, nada dan tahap perincian pengguna secara semula jadi.
- Jangan tambah penerangan, tajuk atau senarai yang tidak membantu.
- Jika maklumat penting tiada, tanya satu soalan yang paling perlu.
`;

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
${QUALITY_RULES}
Peraturan coding:
- Berikan kod lengkap apabila pengguna meminta kod lengkap.
- Jangan ringkaskan atau potong kod yang diminta.
- Jangan ubah bahagian yang tidak diminta.
- Jika membaiki bug, baiki punca bug dan kekalkan tingkah laku lain.
- Jangan mereka fail, API, fungsi atau struktur projek yang belum diberikan.
- Terangkan ringkas cara menggunakan perubahan jika perlu.
`;
  } else {
    system = `
${QUALITY_RULES}
Jawab dengan jelas dan padat.
Gunakan Bahasa Melayu atau Indonesia mengikut bahasa pengguna.
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
