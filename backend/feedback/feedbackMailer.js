const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_TO = "n8413120@gmail.com";

async function sendFeedbackEmail({
  type,
  reason,
  explanation,
  userMessage,
  aiResponse,
  model,
  conversationId,
  messageId
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[Feedback Email] RESEND_API_KEY belum ditetapkan; email feedback dilewati.");
    return { sent: false, skipped: true };
  }

  const to = process.env.FEEDBACK_EMAIL_TO || DEFAULT_TO;
  const feedbackLabel = type === "like" ? "👍 Like" : "👎 Dislike";
  const safe = (value, max = 6000) => String(value || "").slice(0, max);

  const text = [
    "AXMchat — Feedback",
    "",
    `Jenis: ${feedbackLabel}`,
    `Alasan pengguna: ${safe(reason, 1000) || "(tiada alasan dipilih)"}`,
    `Penjelasan AI: ${safe(explanation, 1500) || "(tiada)"}`,
    "",
    "Soalan pengguna:",
    safe(userMessage),
    "",
    "Jawapan AXMchat:",
    safe(aiResponse, 10000),
    "",
    `Model: ${safe(model, 300)}`,
    `Conversation ID: ${safe(conversationId, 200)}`,
    `Message ID: ${safe(messageId, 200)}`,
    `Masa: ${new Date().toISOString()}`
  ].join("\n");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.FEEDBACK_EMAIL_FROM || "AXMchat Feedback <onboarding@resend.dev>",
      to: [to],
      subject: `AXMchat Feedback — ${feedbackLabel}`,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend ${response.status}: ${body.slice(0, 500)}`);
  }

  const result = await response.json().catch(() => ({}));
  console.log("[Feedback Email] Resend accepted email:", result.id || "no-id");
  return { sent: true, id: result.id || null };
}

module.exports = { sendFeedbackEmail };
