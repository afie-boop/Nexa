const axios = require("axios");
const askGemini = require("./gemini");

const PROVIDERS = {
  openrouter: { label: "OpenRouter", key: "OPENROUTER_KEY", base: "https://openrouter.ai/api/v1" },
  groq: { label: "Groq", key: "GROQ_API_KEY", base: "https://api.groq.com/openai/v1" },
  cerebras: { label: "Cerebras", key: "CEREBRAS_API_KEY", base: "https://api.cerebras.ai/v1" },
  mistral: { label: "Mistral", key: "MISTRAL_API_KEY", base: "https://api.mistral.ai/v1" },
  deepseek: { label: "DeepSeek", key: "DEEPSEEK_API_KEY", base: "https://api.deepseek.com/v1" },
  together: { label: "Together AI", key: "TOGETHER_API_KEY", base: "https://api.together.xyz/v1" },
  fireworks: { label: "Fireworks AI", key: "FIREWORKS_API_KEY", base: "https://api.fireworks.ai/inference/v1" },
  gemini: { label: "Google Gemini", key: "GEMINI_API_KEY" }
};

function getProvider(id) {
  const key = String(id || "openrouter").toLowerCase();
  const item = PROVIDERS[key];
  if (!item) throw new Error("Provider tidak disokong: " + key);
  return { id: key, ...item };
}

function getKey(provider) {
  const key = process.env[provider.key];
  if (!key) throw new Error("API key " + provider.key + " belum ditetapkan dalam Render.");
  return key;
}

async function askProvider(providerId, message, options = {}) {
  const provider = getProvider(providerId);
  const model = String(options.model || "").trim();
  if (!model) throw new Error("Model ID untuk " + provider.label + " kosong.");
  if (provider.id === "gemini") return askGemini(message, { ...options, model });
  const messages = [];
  if (options.system) messages.push({ role: "system", content: String(options.system) });
  if (Array.isArray(options.history)) messages.push(...options.history);
  if (Array.isArray(options.messages)) messages.push(...options.messages);
  else messages.push({ role: "user", content: String(message || "") });
  const body = { model, messages };
  if (Number.isInteger(options.maxTokens) && options.maxTokens > 0) body.max_tokens = options.maxTokens;
  if (options.reasoningEffort && provider.id === "openrouter") body.reasoning = { effort: options.reasoningEffort };
  const response = await axios.post(provider.base + "/chat/completions", body, {
    headers: { Authorization: "Bearer " + getKey(provider), "Content-Type": "application/json",
      ...(provider.id === "openrouter" ? { "HTTP-Referer": "https://render.com", "X-Title": "AXMchat" } : {}) },
    timeout: 90000
  });
  const choice = response.data?.choices?.[0];
  const content = choice?.message?.content;
  if (content == null) throw new Error(provider.label + " tidak mengembalikan teks.");
  const usage = response.data?.usage || {};
  options.onUsage?.({
    requestedModel: model, model: response.data?.model || model,
    provider: choice?.provider || provider.label, usedFallback: !!options.usedFallback,
    usage: { prompt_tokens: Number(usage.prompt_tokens || 0), completion_tokens: Number(usage.completion_tokens || 0), total_tokens: Number(usage.total_tokens || 0), ...usage }
  });
  return String(content);
}

async function listProviderModels(providerId) {
  const provider = getProvider(providerId);
  const key = getKey(provider);
  if (provider.id === "gemini") {
    const response = await axios.get("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": key }, timeout: 15000
    });
    return (response.data?.models || [])
      .filter(item => (item.supportedGenerationMethods || []).includes("generateContent"))
      .map(item => ({ id: String(item.name || "").replace(/^models\\//, ""), name: item.displayName || item.name,
        contextLength: item.inputTokenLimit || null, description: item.description || "" }))
      .filter(item => item.id);
  }
  const response = await axios.get(provider.base + "/models", {
    headers: { Authorization: "Bearer " + key }, timeout: 15000
  });
  return (response.data?.data || []).map(item => ({
    id: item.id, name: item.name || item.id,
    contextLength: item.context_length || item.context_window || item.top_provider?.context_length || null,
    pricing: item.pricing || null, description: item.description || ""
  })).filter(item => item.id).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { PROVIDERS, getProvider, askProvider, listProviderModels };
