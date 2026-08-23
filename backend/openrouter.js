const axios = require("axios");
require("dotenv").config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function askOpenRouter(message, options = {}) {
  const { system, model, history } = options;

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  if (history && history.length) {
    messages.push(...history);
  }
  messages.push({ role: "user", content: message });

  const targetModel = model || "openrouter/free";
  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: targetModel,
          messages,
        },
        {
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://render.com",
            "X-Title": "Nexa AI"
          },
          timeout: 45000
        }
      );

      if (
        response.data &&
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message
      ) {
        return response.data.choices[0].message.content;
      }

      throw new Error("Balasan OpenRouter tidak mengandungi format kandungan yang sah.");
    } catch (err) {
      const statusCode = err.response ? err.response.status : null;
      const isRateLimit = statusCode === 429;
      const isServerError = statusCode >= 500 && statusCode < 600;

      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.warn(
          `[OpenRouter] Status ${statusCode || "Network Error"}. Mengulang percubaan (${attempt}/${maxRetries}) selepas ${backoffMs}ms...`
        );
        await sleep(backoffMs);
        continue;
      }

      if (isRateLimit) {
        throw new Error(
          "Had kadar permintaan (Rate limit 429) dicapai pada OpenRouter. Sila tunggu seketika dan cuba lagi atau tukar Model ID dalam paparan Models."
        );
      }

      const errorMsg =
        (err.response && err.response.data && err.response.data.error && err.response.data.error.message) ||
        err.message ||
        "Gagal berkomunikasi dengan OpenRouter.";

      throw new Error(errorMsg);
    }
  }
}

module.exports = askOpenRouter;
