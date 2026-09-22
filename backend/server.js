require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

console.log("=================================");
console.log("Nexa Boot");
console.log("=================================");
console.log("OpenRouter Key :", !!process.env.OPENROUTER_KEY);
console.log("PORT           :", process.env.PORT || 3000);
console.log("=================================");

const classifyTask = require("./router");
const { runPipeline } = require("./pipeline/pipeline");
const { handlePostFeedback } = require("./feedback/feedbackController");

const app = express();

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

app.post("/api/feedback", handlePostFeedback);

app.post("/chat", async (req, res) => {
  const { question, history } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  function sendStatus(text) {
    res.write(
      `data: ${JSON.stringify({
        type: "status",
        text
      })}\n\n`
    );
  }

  function sendProcessStep(step) {
    res.write(
      `data: ${JSON.stringify({
        type: "process_step",
        ...step
      })}\n\n`
    );
  }

  function sendAnswer(text) {
    res.write(
      `data: ${JSON.stringify({
        type: "answer",
        text
      })}\n\n`
    );
    res.end();
  }

  function sendError(text) {
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        text
      })}\n\n`
    );
    res.end();
  }

  try {
    if (!question || !question.trim()) {
      return sendError("Mesej tak boleh kosong.");
    }

    const { generalModel, codingModel, fallbackModel } = req.body;

    sendStatus("Mengelaskan permintaan...");

    const task = await classifyTask(
      question,
      history || []
    );

    const answer = await runPipeline({
      task,
      question,
      history: history || [],
      generalModel,
      codingModel,
      fallbackModel,
      sendStatus,
      sendProcessStep
    });

    sendAnswer(answer);

  } catch (error) {

    console.log("\n============= ERROR =============");
    console.error(error);
    console.error(error.stack);

    if (error.response) {
      console.log("HTTP Status :", error.response.status);
      console.log("Response :", error.response.data);
    }

    console.log("=================================\n");

    sendError(
      error.message || "Ada masalah pada server."
    );
  }
});

app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Nexa Server berjalan di port ${port}`);
});
