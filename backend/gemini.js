const axios = require("axios");
require("dotenv").config();

const DEFAULT_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash";

function toGeminiContents(messages = []) {
  const contents = [];
  let systemText = "";

  for (const item of messages) {
    const role = String(item?.role || "user").toLowerCase();
    const content = typeof item?.content === "string"
      ? item.content
      : Array.isArray(item?.content)
        ? item.content.map(part => typeof part === "string" ? part : part?.text || "").join("\n")
        : String(item?.content ?? "");

    if (!content.trim()) continue;
    if (role === "system" || role === "developer") {
      systemText += (systemText ? "\n\n" : "") + content;
      continue;
    }

    contents.push({
      role: role === "assistant" || role === "model" ? "model" : "user",
      parts: [{ text: content }]
    });
  }

  return { contents, systemText };
}

async function askGemini(message, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Fallback AI belum tersedia: GEMINI_API_KEY belum ditetapkan dalam Render.");
    error.fallbackAttempted = true;
    throw error;
  }

  const model = String(options.model || DEFAULT_MODEL).trim();
  const messages = [];
  if (options.system) messages.push({ role: "system", content: String(options.system) });
  if (Array.isArray(options.history)) messages.push(...options.history.slice(-12));
  messages.push({ role: "user", content: String(message || "") });

  const { contents, systemText } = toGeminiContents(messages);
  if (!contents.length) throw new Error("Fallback Gemini menerima mesej kosong.");

  const body = { contents };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  body.generationConfig = {};
  if (Number.isInteger(options.maxTokens) && options.maxTokens > 0) {
    body.generationConfig.maxOutputTokens = options.maxTokens;
  }
  if (options.reasoningEffort === "high") {
    body.generationConfig.thinkingConfig = { thinkingLevel: "HIGH" };
  } else if (options.reasoningEffort === "medium") {
    body.generationConfig.thinkingConfig = { thinkingLevel: "MEDIUM" };
  } else if (options.reasoningEffort === "none" || options.reasoningEffort === "low") {
    body.generationConfig.thinkingConfig = { thinkingLevel: "LOW" };
  }

  try {
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      body,
      {
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        timeout: 90000
      }
    );

    const candidate = response.data?.candidates?.[0];
    const content = (candidate?.content?.parts || [])
      .map(part => typeof part?.text === "string" ? part.text : "")
      .join("");
    if (!content.trim()) {
      const reason = candidate?.finishReason || "Tiada kandungan";
      throw new Error("Gemini tidak memberikan teks jawapan (" + reason + ").");
    }

    const usage = response.data?.usageMetadata || {};
    options.onUsage?.({
      requestedModel: model,
      model,
      provider: "Google Gemini",
      usedFallback: true,
      usage: {
        prompt_tokens: Number(usage.promptTokenCount || 0),
        completion_tokens: Number(usage.candidatesTokenCount || 0),
        total_tokens: Number(usage.totalTokenCount || 0)
      }
    });

    return content;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message || "Ralat Gemini.";
    const safeError = new Error(
      "Google Gemini " + (status ? "HTTP " + status : "error") + " untuk " + model + ": " + detail
    );
    safeError.fallbackAttempted = true;
    throw safeError;
  }
}

module.exports = askGemini;
