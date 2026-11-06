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
  if (Number.isInteger(requestOptions.maxTokens) && requestOptions.maxTokens > 0) body.max_tokens = requestOptions.maxTokens;
  if (requestOptions.reasoningEffort) body.reasoning = { effort: requestOptions.reasoningEffort };

  const send = (payload) => axios.post("https://openrouter.ai/api/v1/chat/completions", payload, {
    headers: {
      "Authorization": "Bearer " + process.env.OPENROUTER_KEY,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://render.com",
      "X-Title": "AXMchat"
    },
    timeout: 90000
  });

  try {
    const response = await send(body);
    const choice = response.data?.choices?.[0];
    const content = choice?.message?.content;
    requestOptions.onUsage?.({ requestedModel: model, model: response.data?.model || model, provider: choice?.provider || response.data?.provider || "OpenRouter", usedFallback: Boolean(requestOptions.usedFallback), usage: response.data?.usage || {} });
    if (content !== undefined && content !== null) {
      return { content: String(content), finishReason: choice.finish_reason || null, model: response.data?.model || model, provider: choice?.provider || response.data?.provider || "OpenRouter" };
    }
    throw new Error("Balasan OpenRouter tidak mengandungi format kandungan yang sah.");
  } catch (err) {
    // Never silently downgrade Thinking/Balance to a request without reasoning.
    // A provider/model incompatibility must surface instead of pretending the
    // selected response mode was honored.
    throw err;
  }
}

async function callWithRetries(messages, model, options) {
  let lastErr = null;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      if (attempt > 0) await sleep(Math.pow(2, attempt) * 1000);
      return await executeOpenRouterCall(messages, model, options);
    } catch (err) {
      lastErr = err;
      if (!isTemporaryError(err)) {
        const errorMsg = err.response?.data?.error?.message || err.message || "Ralat model.";
        throw new Error("Ralat Model " + model + ": " + errorMsg);
      }
      console.warn("[OpenRouter Temporary Error " + (err.response?.status || "Network") + "] model " + model + ", attempt " + (attempt + 1) + "/" + (options.maxRetries + 1));
    }
  }
  throw lastErr || new Error("Gagal berkomunikasi dengan model " + model + ".");
}

async function askOpenRouter(message, options = {}) {
  const {
    model,
    fallbackModel,
    history,
    system = "",
    maxRetries = 2,
    maxTokens,
    reasoningEffort,
    fallbackEnabled = true,
    maxContinuations = 4,
    onUsage
  } = options;

  const messages = [];
  if (system && String(system).trim()) messages.push({ role: "system", content: String(system) });
  if (history && history.length) messages.push(...history);
  messages.push({ role: "user", content: message });

  const primaryModel = model || "openrouter/free";
  const backupModel = fallbackModel || "openrouter/free";

  const request = async () => {
    try {
      return await callWithRetries(messages, primaryModel, { maxRetries, maxTokens, reasoningEffort, onUsage });
    } catch (primaryError) {
      if (!fallbackEnabled || !backupModel || backupModel === primaryModel) throw primaryError;
      console.warn("[OpenRouter Fallback] Switching from " + primaryModel + " to " + backupModel + ": " + primaryError.message);
      return await callWithRetries(messages, backupModel, { maxRetries: 0, maxTokens, reasoningEffort, onUsage, usedFallback: true });
    }
  };

  let result = await request();
  let completeText = result.content || "";
  let continuationCount = 0;

  // Continue automatically when the provider reports that max_tokens cut off the answer.
  while (result.finishReason === "length" && continuationCount < maxContinuations) {
    continuationCount += 1;
    messages.push({ role: "assistant", content: result.content || "" });
    messages.push({
      role: "user",
      content: "Sambung tepat dari tempat jawapan terakhir terhenti. Jangan ulang kandungan yang sudah diberi, jangan ringkaskan, dan jangan tinggalkan mana-mana bahagian. Jika sedang menulis kod, sambung kod yang sama sehingga lengkap dan pastikan penutup blok, fungsi dan fail disertakan."
    });
    const continuationModel = result.model || primaryModel;
    result = await callWithRetries(messages, continuationModel, {
      maxRetries: 1,
      maxTokens,
      reasoningEffort,
      onUsage,
      usedFallback: continuationModel !== primaryModel
    });
    completeText += result.content || "";
  }

  if (result.finishReason === "length") {
    console.warn("[OpenRouter Output Limit] Jawapan masih mencapai had selepas " + continuationCount + " sambungan.");
  }
  return completeText;
}

module.exports = askOpenRouter;
