const askOpenRouter = require("./openrouter");
const plan = require("./planner");
const validate = require("./validator");
const format = require("./formatter");
const logger = require("./logger");

async function askCoding(question, history = [], onProgress = () => {}) {
  const t0 = logger.start(question);

  // ---- Planner ----
  onProgress("Merancang pendekatan...");
  const rancangan = await plan(question);
  logger.stage("Planner", t0);

  // ---- Coder ----
  onProgress("AI sedang membuat code...");
  const contextPrompt = rancangan
    ? `Rancangan:\n${rancangan}\n\nSoalan pengguna: ${question}`
    : question;

  let draft;
  try {
    draft = await askOpenRouter(contextPrompt, {
      model: "openrouter/free",
      history,
      system:
        "Kamu pakar coding. Tulis code dengan format kemas (indent betul, satu statement satu baris). " +
        "PENTING: panjang/kelengkapan code kena SEPADAN dengan kompleksiti request — " +
        "untuk soalan betul-betul simple (contoh: print satu baris, function asas), bagi ringkas. " +
        "TAPI untuk request yang perlukan fungsi lengkap (contoh: game, app dengan banyak fitur, " +
        "sistem dengan pelbagai bahagian), bagi code YANG LENGKAP dan BERFUNGSI sepenuhnya — " +
        "jangan potong pendek atau tinggalkan bahagian penting sekadar nak 'ringkas'. " +
        "Jangan reka konsep yang pengguna tak minta.",
    });
    if (!draft?.trim()) throw new Error("OpenRouter tidak mengembalikan jawapan.");
  } catch (err) {
    throw err;
  }
  logger.stage("Coder", t0);

  // ---- Reviewer ----
  onProgress("Code disemak...");
  const reviewPrompt = `Semak code berikut dan betulkan jika ada bug.

Soalan:
${question}

Code:
${draft}`;

  let reviewed;
  try {
    reviewed = await askOpenRouter(reviewPrompt, { model: "openai/gpt-oss-20b:free" });
    if (!reviewed?.trim()) reviewed = draft;
  } catch {
    reviewed = draft;
  }
  logger.stage("Reviewer", t0);

  // ---- Validator ----
  onProgress("Mengesahkan jawapan...");
  const validation = validate(reviewed);
  if (!validation.valid) {
    console.warn("[VALIDATOR] Isu dikesan:", validation.issues.join("; "));
  }
  logger.stage("Validator", t0);

  // ---- Formatter ----
  const finalAnswer = format(reviewed);
  logger.stage("Formatter", t0);

  logger.finish(t0);
  return finalAnswer;
}

module.exports = askCoding;
