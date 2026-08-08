const askOpenRouter = require("./openrouter");

async function askGeneral(question, history = []) {
  // Use Qwen3 235B A22B Instruct 2507 from OpenRouter as requested
  return await askOpenRouter(question, {
    model: "qwen/qwen3-235b-a22b:free",
    history,
    system: "Kamu adalah Nexa, asisten AI yang bijak dan membantu. PENTING: Gunakan format Markdown yang kemas seperti header (###), senarai (bullet points), dan teks tebal (bold) untuk memastikan jawapan mudah dibaca dan tersusun. Jawab dalam Bahasa Melayu atau Bahasa Indonesia mengikut kesesuaian soalan."
  });
}

module.exports = askGeneral;
