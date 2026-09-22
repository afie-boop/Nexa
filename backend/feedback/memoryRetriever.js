const feedbackStore = require("./feedbackStore");

// Common Malay and English stop words to filter out before keyword matching
const STOP_WORDS = new Set([
  "dan", "yang", "dalam", "dengan", "untuk", "ini", "itu", "saya", "kamu", "ia", "dia", "mereka", "kita", "kami",
  "ada", "adalah", "sebagai", "dari", "daripada", "ke", "pada", "di", "oleh", "tentang", "seperti", "atau", "jika",
  "the", "a", "an", "to", "in", "of", "and", "or", "for", "with", "on", "at", "by", "about", "as", "is", "it", "you", "i"
]);

function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function retrieveRelevantMemories(question) {
  const keywords = extractKeywords(question);
  const lowercaseQuestion = question.toLowerCase();

  const lessons = feedbackStore.getLessons();
  const preferences = feedbackStore.getPreferences();

  const matchedLessons = [];
  const matchedPreferences = [];

  // Match Lessons
  for (const item of lessons) {
    // Check if the lesson content or category matches
    const lessonText = item.lesson.toLowerCase();
    const origContext = (item.original_context || "").toLowerCase();

    // 1. Direct substring match (powerful for exact APIs or specific terms)
    let isMatch = false;

    // Check if any keyword of length > 3 is present in the lesson/context
    const matchesKeyword = keywords.some(kw => {
      if (kw.length <= 3) return false;
      return lessonText.includes(kw) || origContext.includes(kw);
    });

    if (matchesKeyword || lowercaseQuestion.includes(lessonText) || lessonText.includes(lowercaseQuestion)) {
      isMatch = true;
    }

    if (isMatch) {
      // Confidence heuristic: only show if confidence is medium/high,
      // or if there is a strong keyword match (low confidence can be shown if match is solid)
      matchedLessons.push(item);
    }
  }

  // Match Preferences
  for (const item of preferences) {
    const prefText = item.preference.toLowerCase();
    let isMatch = false;

    const matchesKeyword = keywords.some(kw => {
      if (kw.length <= 3) return false;
      return prefText.includes(kw);
    });

    if (matchesKeyword || lowercaseQuestion.includes(prefText) || prefText.includes(lowercaseQuestion)) {
      isMatch = true;
    }

    if (isMatch) {
      matchedPreferences.push(item);
    }
  }

  // Build prompt instruction block
  let warningPrompt = "";

  if (matchedLessons.length > 0) {
    warningPrompt += "\n[Pencegahan Kesalahan Lepas / Avoid Repeating Past Mistakes]:\n";
    matchedLessons.forEach((item, index) => {
      const confidenceNote = item.confidence === "high" ? "Mesti Elak" : "Peringatan";
      warningPrompt += `- ${confidenceNote}: ${item.lesson} (Kategori: ${item.category})\n`;
      warningPrompt += `  Konteks asal: ${item.original_context || "tidak dinyatakan"}\n`;
    });
  }

  if (matchedPreferences.length > 0) {
    warningPrompt += "\n[Keutamaan Pengguna / User Preferences]:\n";
    matchedPreferences.forEach((item, index) => {
      warningPrompt += `- Keutamaan: ${item.preference}\n`;
    });
  }

  return {
    matchedLessons,
    matchedPreferences,
    warningPrompt: warningPrompt.trim()
  };
}

module.exports = { retrieveRelevantMemories };
