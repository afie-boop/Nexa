const logger = require("../utils/logger");

async function validator(data) {
  logger.info("Validator", "Mengesahkan output...");

  const {
    response,
    review,
    retrievedMemories,
    sendStatus = () => {}
  } = data;

  sendStatus("Validator sedang menyemak...");

  let valid = true;
  const errors = [];

  if (!response || !response.trim()) {
    valid = false;
    errors.push("Output kosong.");
  }

  if (review && !review.passed) {
    valid = false;
    errors.push(...review.issues);
  }

  // Verification against retrieved memories (Preventing Repeated Mistakes)
  if (retrievedMemories && retrievedMemories.matchedLessons && retrievedMemories.matchedLessons.length > 0) {
    logger.info("Validator", "Menjalankan pemeriksaan tambahan terhadap memori kesalahan lampau...");
    const responseLower = (response || "").toLowerCase();

    for (const item of retrievedMemories.matchedLessons) {
      const lessonLower = item.lesson.toLowerCase();
      // Try to detect if a high confidence lesson is being violated.
      // E.g., if lesson says "Jangan gunakan X" (Avoid X) and response still has X.
      // Let's extract terms of interest (like API or library names) from the lesson or original context.
      const words = item.lesson.split(/\s+/).filter(w => w.length > 4 && !w.match(/^(jangan|gunakan|adalah|dengan|untuk|dalam|bahawa|seperti|kerana)$/i));

      let potentialViolation = false;
      let violatedTerm = "";

      for (const word of words) {
        const cleanWord = word.replace(/[^\w\-\.]/g, "").toLowerCase();
        if (cleanWord.length > 3 && responseLower.includes(cleanWord)) {
          // If the word represents a specific code API or term, and the lesson is high/medium confidence
          // and it specifically asks to "avoid" or "jangan", we flag a potential repetition warning.
          if (lessonLower.includes("jangan") || lessonLower.includes("elakkan") || lessonLower.includes("avoid")) {
            potentialViolation = true;
            violatedTerm = cleanWord;
            break;
          }
        }
      }

      if (potentialViolation && (item.confidence === "high" || item.confidence === "medium")) {
        const warnMsg = `AMARAN PENGULANGAN RALAT: Jawapan berpotensi mengulangi kesalahan lepas ("${violatedTerm}") yang dilarang dalam pengajaran: "${item.lesson}"`;
        logger.info("Validator", warnMsg);
        sendStatus(`Amaran: ${warnMsg}`);

        // If confidence is high, let's enforce strict validation error to make the system highly reliable!
        if (item.confidence === "high") {
          valid = false;
          errors.push(`Output melanggar pengajaran ber-confidence tinggi: "${item.lesson}". Sila elakkan mengulangi kesalahan ini.`);
        }
      }
    }
  }

  logger.success(
    "Validator",
    valid ? "Output sah." : "Output tidak sah."
  );

  return {
    ...data,
    valid,
    validation: errors
  };
}

module.exports = validator;
