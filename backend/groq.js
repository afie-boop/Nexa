const axios = require("axios");
require("dotenv").config();

async function askGroq(message, options = {}) {
  const { system, model, history } = options;

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  if (history && history.length) {
    messages.push(...history);
  }
  messages.push({ role: "user", content: message });

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: model || "openai/gpt-oss-120b",
      messages,
    },
    {
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data.choices[0].message.content;
}

module.exports = askGroq;
