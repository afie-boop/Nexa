const axios = require("axios");
require("dotenv").config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTemporaryError(err) {
  if (!err.response) return true;
  const status = err.response.status;
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

async function executeOpenRouterCall(messages, model, requestOptions = {}) {
  const body = { model, messages };
  if (Number.isInteger(requestOptions.maxTokens) && requestOptions.maxTokens > 0) {
    body.max_tokens = requestOptions.maxTokens;
  }
  if (requestOptions.reasoningEffort) {
    body.reasoning_effort = requestOptions.reasoningEffort;
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      body,
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

    const content = response.data?.choices?.[0]?.message?.content;
    if (content !== undefined && content !== null) return content;
    throw new Error("Balasan OpenRouter tidak mengandungi format kandungan yang sah.");
  } catch (err) {
    // Some selected models do not support reasoning_effort. Retry the same
    // request once without the optional reasoning control instead of breaking the mode.
    if (requestOptions.reasoningEffort && err.response?.status === 400) {
      const retryBody = { model, messages };
      if (Number.isInteger(requestOptions.maxTokens) && requestOptions.maxTokens > 0) {
        retryBody.max_tokens = requestOptions.maxTokens;
      }
      const retry = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        retryBody,
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
      const content = retry.data?.choices?.[0]?.message?.content;
      if (content !== undefined && content !== null) return content;
    }
    throw err;
  }
}

async function askOpenRouter(message, options = {}) {
  const {
    system,
    model,
    fallbackModel,
    history,
    maxRetries = 2,
    maxTokens,
    reasoningEffort,
    fallbackEnabled = true
  } = options;

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  if (history && history.length) messages.push(...history);
  messages.push({ role: "user", content: message });

  const primaryModel = model || "openrouter/free";
  const backupModel = fallbackModel || "openrouter/free";
  let lastErr = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await sleep(backoffMs);
      }
      return await executeOpenRouterCall(messages, primaryModel, { maxTokens, reasoningEffort });
    } catch (err) {
      lastErr = err;
      const statusCode = err.response ? err.response.status : null;
      const isTemp = isTemporaryError(err);

      if (!isTemp) {
        const errorMsg =
          err.response?.data?.error?.message ||
          err.message ||
          `Ralat konfig / kekal pada model ${primaryModel}.`;
        throw new Error(`Ralat Model ${primaryModel}: ${errorMsg}`);
      }

      console.warn(`[OpenRouter Temporary Error ${statusCode || "Network"}] model ${primaryModel}, attempt ${attempt + 1}/${maxRetries + 1}`);
    }
  }

  if (fallbackEnabled && backupModel && backupModel !== primaryModel) {
    try {
      return await executeOpenRouterCall(messages, backupModel, { maxTokens, reasoningEffort });
    } catch (fallbackErr) {
      const fbMsg =
        fallbackErr.response?.data?.error?.message ||
        fallbackErr.message ||
        "Ralat pada fallback model.";
      throw new Error(`Model utama ${primaryModel} dan Fallback Model ${backupModel} kedua-duanya gagal. Ralat fallback: ${fbMsg}`);
    }
  }

  const finalErrorMsg =
    lastErr?.response?.data?.error?.message ||
    lastErr?.message ||
    `Gagal berkomunikasi dengan model ${primaryModel}.`;
  throw new Error(finalErrorMsg);
}

module.exports = askOpenRouter;