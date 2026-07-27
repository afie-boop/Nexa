const askGroq = require("./groq");

async function askGeneral(question, history = []) {
  // Use Groq for general queries as requested
  return await askGroq(question, {
    model: "openai/gpt-oss-120b",
    history,
    system: "Kamu adalah Nexa, asisten AI yang bijak dan membantu. PENTING: Gunakan format Markdown yang kemas seperti header (###), senarai (bullet points), dan teks tebal (bold) untuk memastikan jawapan mudah dibaca dan tersusun. Jawab dalam Bahasa Melayu atau Bahasa Indonesia mengikut kesesuaian soalan."
  });
}

module.exports = askGeneral;
