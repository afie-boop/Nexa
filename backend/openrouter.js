const axios = require("axios");
require("dotenv").config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTemporaryError(err) {
  if (!err.response) {
    // Network error, timeout, DNS failure, etc.
    return true;
  }
  const status = err.response.status;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

async function executeOpenRouterCall(messages, model) {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model,
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
}

async function askOpenRouter(message, options = {}) {
  const { system, model, fallbackModel, history } = options;

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  if (history && history.length) {
    messages.push(...history);
  }
  messages.push({ role: "user", content: message });

  const primaryModel = model || "openrouter/free";
  const backupModel = fallbackModel || "openrouter/free";
  const maxRetries = 2; // Maksimal 2 retry untuk model utama

  let lastErr = null;

  // Percubaan ke atas Primary Model
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt) * 1000; // Retry 1: 2000ms, Retry 2: 4000ms
        console.warn(
          `[OpenRouter] Retry ${attempt}/${maxRetries} untuk model utama '${primaryModel}' selepas ${backoffMs}ms...`
        );
        await sleep(backoffMs);
      }
      return await executeOpenRouterCall(messages, primaryModel);
    } catch (err) {
      lastErr = err;
      const statusCode = err.response ? err.response.status : null;
      const isTemp = isTemporaryError(err);

      if (!isTemp) {
        // Permanent error (cth: invalid model ID, 400 bad request, 401 unauthorized, 403, 404)
        const errorMsg =
          (err.response && err.response.data && err.response.data.error && err.response.data.error.message) ||
          err.message ||
          `Ralat konfig / kekal pada model '${primaryModel}'.`;
        console.error(`[OpenRouter Permanent Error ${statusCode || ''}]: ${errorMsg}`);
        throw new Error(`Ralat Model '${primaryModel}': ${errorMsg}`);
      }

      console.warn(
        `[OpenRouter Temporary Error ${statusCode || 'Network'}] pada model '${primaryModel}' (Percubaan ${attempt + 1}/${maxRetries + 1}).`
      );
    }
  }

  // Jika primary model gagal selepas 2 retry dan error adalah temporary, cuba Fallback Model jika berbeza
  if (backupModel && backupModel !== primaryModel) {
    console.warn(
      `[OpenRouter Fallback Triggered] Model utama '${primaryModel}' gagal selepas ${maxRetries} retry. Mencuba Fallback Model ID: '${backupModel}'...`
    );
    try {
      return await executeOpenRouterCall(messages, backupModel);
    } catch (fallbackErr) {
      const fbMsg =
        (fallbackErr.response && fallbackErr.response.data && fallbackErr.response.data.error && fallbackErr.response.data.error.message) ||
        fallbackErr.message ||
        "Ralat pada fallback model.";
      throw new Error(
        `Model utama '${primaryModel}' dan Fallback Model '${backupModel}' kedua-duanya gagal. Ralat fallback: ${fbMsg}`
      );
    }
  }

  // Jika backupModel sama dengan primaryModel atau tidak dikonfigurasi
  const finalErrorMsg =
    (lastErr.response && lastErr.response.data && lastErr.response.data.error && lastErr.response.data.error.message) ||
    lastErr.message ||
    `Gagal berkomunikasi dengan model '${primaryModel}'.`;
  throw new Error(finalErrorMsg);
}

module.exports = askOpenRouter;
