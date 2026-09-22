const askOpenRouter = require("../openrouter");

async function analyzeFeedback(feedbackData) {
  const { user_message, ai_response, reason } = feedbackData;

  const prompt = `
Anda adalah Nexa AI Feedback Analyzer. Tugas anda adalah menganalisis feedback negatif (dislike) yang diberikan oleh pengguna terhadap jawapan AI, dan mengekstrak pelajaran (lesson) atau keutamaan pengguna (user preference).

Konteks Perbualan:
Mesej Pengguna:
"""
${user_message}
"""

Jawapan AI:
"""
${ai_response}
"""

Alasan Dislike Pengguna (jika ada): "${reason || 'Tiada alasan khusus'}"

Sila kategorikan isu ini kepada salah satu daripada yang berikut:
- wrong_information (maklumat fakta salah)
- wrong_code (kod salah/tidak boleh run)
- incomplete_answer (jawapan tergantung atau tidak lengkap)
- instruction_not_followed (tidak mengikut arahan/prompt)
- reasoning_error (kesalahan logik/pemikiran)
- outdated_information (maklumat lapuk/deprecated)
- formatting_problem (masalah visual/format markdown)
- style_problem (gaya penulisan tidak sesuai)
- other (lain-lain)

Tentukan sama ada ini adalah:
1. "preference" (pilihan/gaya/bahasa kegemaran pengguna, contoh: mahukan jawapan pendek, lebih suka kod sahaja, mahu bahasa Melayu, dsb.)
2. "error" (kesalahan teknikal, fakta salah, kod salah, arahan dilanggar)

Sila berikan jawapan dalam format JSON sahaja seperti berikut:
{
  "type": "error" atau "preference",
  "category": "salah satu kategori di atas",
  "lesson_or_preference": "Satu pengajaran atau keutamaan yang ringkas, pendek, padat dan boleh diguna semula untuk masa hadapan (Maksimum 1-2 ayat)",
  "confidence": "low" atau "medium" atau "high"
}

Pastikan anda hanya mengembalikan JSON yang sah. Jangan sertakan markdown, penulisan hiasan atau pembuka \`\`\`json.
`;

  try {
    const rawResult = await askOpenRouter(prompt, {
      model: "openrouter/free",
      system: "Anda adalah feedback analyzer. Sila balas dengan JSON format sahaja tanpa sebarang markdown hiasan."
    });

    let cleaned = rawResult.trim();
    // Strip backticks if any
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    const analysis = JSON.parse(cleaned);

    // Validate types & fallback
    if (!["error", "preference"].includes(analysis.type)) {
      analysis.type = "error";
    }
    const validCategories = [
      "wrong_information", "wrong_code", "incomplete_answer",
      "instruction_not_followed", "reasoning_error", "outdated_information",
      "formatting_problem", "style_problem", "other"
    ];
    if (!validCategories.includes(analysis.category)) {
      analysis.category = "other";
    }
    if (!["low", "medium", "high"].includes(analysis.confidence)) {
      analysis.confidence = "low";
    }
    if (!analysis.lesson_or_preference || !analysis.lesson_or_preference.trim()) {
      analysis.lesson_or_preference = `Hindari maklum balas negatif untuk: ${user_message.substring(0, 50)}`;
    }

    return analysis;
  } catch (err) {
    console.error("[feedbackAnalyzer] Gagal menganalisis maklum balas dengan LLM:", err);
    // Secure fallback without crashing
    const isCode = user_message.toLowerCase().includes("kod") || user_message.toLowerCase().includes("code") || user_message.toLowerCase().includes("function") || user_message.toLowerCase().includes("react");
    return {
      type: "error",
      category: isCode ? "wrong_code" : "wrong_information",
      lesson_or_preference: `Hindari pepijat berkaitan: ${user_message.substring(0, 50)}`,
      confidence: "low"
    };
  }
}

module.exports = { analyzeFeedback };
