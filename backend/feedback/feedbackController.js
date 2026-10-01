const { processUserFeedback } = require("./lessonGenerator");

const askOpenRouter = require("../openrouter");
const { sendFeedbackEmail } = require("./feedbackMailer");

async function handleFeedbackReason(req, res) {
  const { type, user_message, ai_response, reason, model } = req.body || {};
  if (!user_message || !ai_response || !["like", "dislike"].includes(type)) {
    return res.status(400).json({ success: false, message: "type, user_message dan ai_response diperlukan." });
  }

  const selectedReason = typeof reason === "string" ? reason.trim() : "";
  const prompt = type === "like"
    ? `Terangkan secara ringkas dalam Bahasa Melayu kenapa pengguna mungkin menyukai jawapan AI ini. Jika alasan pengguna diberi, gunakan alasan itu; jika kosong, simpulkan alasan yang munasabah berdasarkan jawapan. Jangan dakwa fakta tentang perasaan pengguna yang tidak diketahui. Jawab satu ayat sahaja.\nAlasan pengguna: ${selectedReason || "(tiada)"}\nSoalan pengguna: ${user_message.slice(0, 1200)}\nJawapan AI: ${ai_response.slice(0, 3000)}`
    : `Terangkan secara ringkas dalam Bahasa Melayu kenapa jawapan AI ini mempunyai masalah berdasarkan alasan pengguna. Jika alasan pengguna kosong, kenal pasti masalah paling munasabah daripada soalan dan jawapan. Jangan mereka-reka fakta di luar teks. Jawab satu ayat sahaja.\nAlasan pengguna: ${selectedReason || "(tiada)"}\nSoalan pengguna: ${user_message.slice(0, 1200)}\nJawapan AI: ${ai_response.slice(0, 3000)}`;

  try {
    const explanation = await askOpenRouter(prompt, {
      model: model || "openrouter/free",
      fallbackEnabled: false,
      maxRetries: 0,
      maxTokens: 180,
      reasoningEffort: "none",
      system: "Kamu ialah modul analisis maklum balas AXMchat. Fokus pada teks yang diberi. Jangan tambah maklumat yang tidak ada."
    });
    const finalExplanation = String(explanation).trim();
    sendFeedbackEmail({
      type,
      reason: selectedReason,
      explanation: finalExplanation,
      userMessage,
      aiResponse: ai_response,
      model,
      conversationId: req.body.conversation_id,
      messageId: req.body.message_id
    }).catch((emailError) => {
      console.error("[Feedback Email Error]:", emailError.message);
    });

    return res.status(200).json({ success: true, explanation: finalExplanation });
  } catch (error) {
    console.error("[Feedback Reason Error]:", error.message);
    return res.status(503).json({ success: false, message: "Gagal menjana alasan maklum balas." });
  }
}


async function handlePostFeedback(req, res) {
  const {
    conversation_id,
    message_id,
    user_message,
    ai_response,
    provider,
    model,
    type,
    reason
  } = req.body;

  if (!user_message || !ai_response) {
    return res.status(400).json({
      success: false,
      message: "user_message dan ai_response diperlukan."
    });
  }

  // Run asynchronously so that we don't block the chat experience or the feedback submission experience!
  processUserFeedback({
    conversation_id,
    message_id,
    user_message,
    ai_response,
    provider,
    model,
    type,
    reason
  })
  .then((result) => {
    console.log(`[feedbackController] Maklum balas diproses secara tak senkron:`, result.status);
  })
  .catch((err) => {
    console.error("[feedbackController] Gagal memproses maklum balas secara tak senkron:", err);
  });

  return res.status(200).json({
    success: true,
    message: "Maklum balas anda telah disimpan dan sedang dianalisis secara tak senkron."
  });
}

module.exports = { handlePostFeedback, handleFeedbackReason };
