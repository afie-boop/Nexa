const axios = require("axios");

const PROVIDERS = {
  openrouter: { label: "OpenRouter", key: "OPENROUTER_KEY", base: "https://openrouter.ai/api/v1" }
};

function getProvider(id) {
  const key = String(id || "openrouter").toLowerCase();
  if (key !== "openrouter") throw new Error("AXMchat kini hanya menyokong OpenRouter.");
  return { id: "openrouter", ...PROVIDERS.openrouter };
}

function getKey(provider) {
  const key = process.env[provider.key];
  if (!key) throw new Error("API key " + provider.key + " belum ditetapkan dalam Render.");
  return key;
}

async function askProvider(providerId, message, options = {}) {
  const provider = getProvider(providerId);
  const model = String(options.model || "").trim();
  if (!model) throw new Error("Model ID OpenRouter kosong.");
  const messages = [];
  if (options.system) messages.push({ role: "system", content: String(options.system) });
  if (Array.isArray(options.history)) messages.push(...options.history);
  if (Array.isArray(options.messages)) messages.push(...options.messages);
  else messages.push({ role: "user", content: String(message || "") });
  const body = { model, messages };
  if (Number.isInteger(options.maxTokens) && options.maxTokens > 0) body.max_tokens = options.maxTokens;
  if (options.reasoningEffort) body.reasoning = { effort: options.reasoningEffort };
  const response = await axios.post(provider.base + "/chat/completions", body, {
    headers: { Authorization: "Bearer " + getKey(provider), "Content-Type": "application/json", "HTTP-Referer": "https://render.com", "X-Title": "AXMchat" },
    timeout: 90000
  });
  const choice = response.data?.choices?.[0];
  const content = choice?.message?.content;
  if (content == null) throw new Error("OpenRouter tidak mengembalikan teks.");
  const usage = response.data?.usage || {};
  options.onUsage?.({
    requestedModel: model, model: response.data?.model || model,
    provider: choice?.provider || "OpenRouter", usedFallback: !!options.usedFallback,
    usage: { prompt_tokens: Number(usage.prompt_tokens || 0), completion_tokens: Number(usage.completion_tokens || 0), total_tokens: Number(usage.total_tokens || 0), ...usage }
  });
  return String(content);
}

async function listProviderModels() {
  const provider = getProvider("openrouter");
  const response = await axios.get(provider.base + "/models", {
    headers: { Authorization: "Bearer " + getKey(provider) }, timeout: 15000
  });
  return (response.data?.data || []).map(item => ({
    id: item.id, name: item.name || item.id,
    contextLength: item.context_length || item.top_provider?.context_length || null,
    pricing: item.pricing || null, description: item.description || ""
  })).filter(item => item.id).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { PROVIDERS, getProvider, askProvider, listProviderModels };