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
const { runAgentTask, resolvePendingPermission } = require("./agent/agentController");
const githubAuthRouter = require("./auth/github");

const app = express();

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

// Mount GitHub Auth Routes
app.use("/api/auth/github", githubAuthRouter);
app.use("/api/github", githubAuthRouter);

app.post("/api/feedback", handlePostFeedback);

// Agent Permission Approval Endpoint
app.post("/api/agent/permission", (req, res) => {
  const { sessionId, requestId, approved } = req.body;

  if (!sessionId || !requestId) {
    return res.status(400).json({ error: "sessionId dan requestId diperlukan." });
  }

  const resolved = resolvePendingPermission(sessionId, requestId, !!approved);
  return res.json({ success: true, resolved });
});

const { loadSession } = require("./auth/github");

// Agent Execution Stream Endpoint
app.post("/api/agent", async (req, res) => {
  const { question, history, codingModel, fallbackModel, sessionId: clientSessionId, selectedRepo: bodySelectedRepo } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  const sessionId = clientSessionId || `agent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  function sendEvent(type, payload = {}) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    }
  }

  try {
    if (!question || !question.trim()) {
      sendEvent("error", { text: "Mesej tugasan ejen tidak boleh kosong." });
      return res.end();
    }

    const githubSession = loadSession(req);
    const selectedRepo = bodySelectedRepo || (githubSession && githubSession.selectedRepo ? githubSession.selectedRepo : null);

    await runAgentTask({
      sessionId,
      question,
      history: history || [],
      model: codingModel || "openrouter/free",
      fallbackModel: fallbackModel || "openrouter/free",
      selectedRepo,
      sendEvent
    });

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    console.error("[Agent Error]", error);
    if (!res.writableEnded) {
      sendEvent("error", { text: error.message || "Ada masalah semasa menjalankan Nexa Agent." });
      res.end();
    }
  }
});

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
