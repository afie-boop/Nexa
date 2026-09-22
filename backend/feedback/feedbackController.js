const { processUserFeedback } = require("./lessonGenerator");

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

module.exports = { handlePostFeedback };
