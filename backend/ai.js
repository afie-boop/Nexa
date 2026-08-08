const { GoogleGenerativeAI } = require("@google/generative-ai");

require("dotenv").config();

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_KEY
);

async function askGemini(message){

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const result = await model.generateContent(message);

  return result.response.text();

}

module.exports = askGemini;
