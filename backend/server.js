require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const HERMES_SERVICE_URL = process.env.HERMES_SERVICE_URL || "http://127.0.0.1:8000";

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

// Helper to save GitHub session securely on server
function saveGitHubSession(sessionData) {
  try {
    const dataDir = path.join(__dirname, "feedback", "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const sessionPath = path.join(dataDir, "github_session.json");
    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), "utf8");
  } catch (err) {
    console.error("[GitHub Session Write Error]:", err.message);
  }
}

// Read GitHub Session (Strictly rejects mock_token)
function getGitHubSession() {
  try {
    const sessionPath = path.join(__dirname, "feedback", "data", "github_session.json");
    if (fs.existsSync(sessionPath)) {
      const data = fs.readFileSync(sessionPath, "utf8");
      const parsed = JSON.parse(data);
      if (parsed.connected && parsed.accessToken && parsed.accessToken !== "mock_token") {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[GitHub Session Read Error]:", err.message);
  }
  return { connected: false, username: null, accessToken: null };
}

// GET /api/auth/github - Start OAuth flow
app.get("/api/auth/github", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({
      message: "GITHUB_CLIENT_ID belum dikonfigurasi dalam persekitaran server."
    });
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/github/callback`);
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,user`;
  return res.redirect(githubAuthUrl);
});

// GET /api/auth/github/callback - Handle OAuth callback
app.get("/api/auth/github/callback", async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!code) {
    return res.status(400).send("Kod kebenaran OAuth GitHub tidak ditemui.");
  }

  if (!clientId || !clientSecret) {
    return res.status(500).send("Kredensial GitHub OAuth (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET) belum dikonfigurasi.");
  }

  try {
    // 1. Exchange code for access_token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: clientId,
        client_secret: clientSecret,
        code
      },
      {
        headers: { Accept: "application/json" }
      }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      return res.status(400).send("Gagal mendapatkan access_token dari GitHub.");
    }

    // 2. Fetch authenticated GitHub user details
    const userRes = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Nexa-AI-App"
      }
    });

    const sessionData = {
      connected: true,
      username: userRes.data.login,
      accessToken: accessToken,
      user: { login: userRes.data.login, name: userRes.data.name }
    };

    saveGitHubSession(sessionData);

    // Redirect to frontend root
    return res.redirect("/");
  } catch (err) {
    console.error("[GitHub OAuth Callback Error]:", err.message);
    return res.status(500).send("Gagal melengkapkan OAuth log masuk GitHub: " + err.message);
  }
});

// GET /api/auth/github/status - Safe connection status check (never exposes token)
app.get("/api/auth/github/status", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const session = getGitHubSession();
    return res.status(200).json({
      connected: !!(session && session.connected && session.accessToken && session.accessToken !== "mock_token"),
      username: session ? session.username || null : null
    });
  } catch (err) {
    return res.status(200).json({
      connected: false,
      username: null
    });
  }
});

// POST /api/auth/github/disconnect - Clear GitHub session
app.post("/api/auth/github/disconnect", (req, res) => {
  saveGitHubSession({ connected: false, username: null, accessToken: null });
  return res.status(200).json({ connected: false, message: "Akaun GitHub berjaya dilog keluar." });
});

// GET /api/github/repos - Authenticated read-only repository list
app.get("/api/github/repos", async (req, res) => {
  const session = getGitHubSession();

  if (!session.connected || !session.accessToken || session.accessToken === "mock_token") {
    return res.status(401).json({
      connected: false,
      message: "GitHub account not connected. Sambungan akaun GitHub fizikal/sebenar diperlukan.",
      repos: []
    });
  }

  try {
    const response = await axios.get("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Nexa-AI-App"
      },
      timeout: 10000
    });

    const repos = response.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: { login: repo.owner.login },
      private: repo.private,
      default_branch: repo.default_branch,
      html_url: repo.html_url
    }));

    return res.status(200).json({
      connected: true,
      username: session.username,
      repos
    });
  } catch (error) {
    console.error("[GitHub Repos Error]:", error.message);
    return res.status(502).json({
      connected: true,
      message: "Gagal mendapatkan senarai repositori GitHub.",
      error: error.message,
      repos: []
    });
  }
});

app.post("/api/agent/task/:task_id/push", async (req, res) => {
  const { task_id } = req.params;
  const { commit_message } = req.body || {};

  const validIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!task_id || !validIdRegex.test(task_id)) {
    return res.status(400).json({
      status: "error",
      message: "Format task ID tidak sah."
    });
  }

  if (!commit_message || typeof commit_message !== "string" || !commit_message.trim()) {
    return res.status(400).json({
      status: "error",
      message: "Mesej commit diperlukan."
    });
  }

  const cleanMessage = commit_message.replace(/[\r\n\t]/g, " ").trim();
  if (cleanMessage.length > 200) {
    return res.status(400).json({
      status: "error",
      message: "Mesej commit melebihi had 200 aksara."
    });
  }

  const session = getGitHubSession();
  const token = session.accessToken;

  try {
    const response = await axios.post(`${HERMES_SERVICE_URL}/task/${task_id}/push`, {
      commit_message: cleanMessage,
      token: token || null
    }, {
      timeout: 35000
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("[Hermes Agent Push Error]:", error.message);

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    return res.status(503).json({
      status: "error",
      service: "nexa-hermes",
      message: "Hermes agent service is currently unreachable.",
      details: error.message
    });
  }
});

// GET /api/github/repos/:owner/:repo/branches - Read-only branch list
app.get("/api/github/repos/:owner/:repo/branches", async (req, res) => {
  const session = getGitHubSession();
  const { owner, repo } = req.params;

  const validNameRegex = /^[a-zA-Z0-9_.-]+$/;
  if (!owner || !repo || !validNameRegex.test(owner) || !validNameRegex.test(repo)) {
    return res.status(400).json({
      message: "Format pemilik atau nama repositori tidak sah."
    });
  }

  if (!session.connected) {
    return res.status(401).json({
      connected: false,
      message: "GitHub account not connected.",
      branches: []
    });
  }

  // If mock token or offline mock session
  if (session.accessToken === "mock_token" || !session.accessToken) {
    return res.status(200).json({
      connected: true,
      repository: `${owner}/${repo}`,
      branches: [
        { name: "main", protected: false },
        { name: "feature/github-integration-jules-18010832290777692266", protected: false },
        { name: "dev", protected: false }
      ]
    });
  }

  try {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Nexa-AI-App"
      },
      timeout: 10000
    });

    const branches = response.data.map(b => ({
      name: b.name,
      protected: b.protected
    }));

    return res.status(200).json({
      connected: true,
      repository: `${owner}/${repo}`,
      branches
    });
  } catch (error) {
    console.error("[GitHub Branches Error]:", error.message);
    return res.status(502).json({
      connected: true,
      message: "Gagal mendapatkan senarai branch GitHub.",
      error: error.message,
      branches: []
    });
  }
});

app.get("/api/agent/health", async (req, res) => {
  try {
    const response = await axios.get(`${HERMES_SERVICE_URL}/health`, {
      timeout: 5000
    });
    return res.status(200).json(response.data);
  } catch (error) {
    console.error("[Hermes Service Connection Error]:", error.message);
    return res.status(503).json({
      status: "error",
      service: "nexa-hermes",
      message: "Hermes agent service is currently unreachable.",
      details: error.message
    });
  }
});

app.post("/api/agent/run", async (req, res) => {
  const { task, session_id, repository, branch } = req.body || {};

  if (!task || typeof task !== "string" || !task.trim()) {
    return res.status(400).json({
      status: "error",
      message: "Tugasan tidak boleh kosong."
    });
  }

  if (task.trim().length > 5000) {
    return res.status(400).json({
      status: "error",
      message: "Tugasan melebihi had 5000 aksara."
    });
  }

  const repoRegex = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
  if (repository && (typeof repository !== "string" || !repoRegex.test(repository.trim()))) {
    return res.status(400).json({
      status: "error",
      message: "Format repositori tidak sah (Format dijangka: owner/repository)."
    });
  }

  const branchRegex = /^[a-zA-Z0-9_/.-]+$/;
  if (branch && (typeof branch !== "string" || !branchRegex.test(branch.trim()))) {
    return res.status(400).json({
      status: "error",
      message: "Format branch tidak sah."
    });
  }

  try {
    const response = await axios.post(`${HERMES_SERVICE_URL}/task`, {
      task: task.trim(),
      session_id: session_id || null,
      repository: repository ? repository.trim() : null,
      branch: branch ? branch.trim() : null
    }, {
      timeout: 5000
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("[Hermes Agent Run Error]:", error.message);

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    return res.status(503).json({
      status: "error",
      service: "nexa-hermes",
      message: "Hermes agent service is currently unreachable.",
      details: error.message
    });
  }
});

app.get("/api/agent/task/:task_id", async (req, res) => {
  const { task_id } = req.params;

  try {
    const response = await axios.get(`${HERMES_SERVICE_URL}/task/${task_id}`, {
      timeout: 5000
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("[Hermes Agent Status Error]:", error.message);

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    return res.status(503).json({
      status: "error",
      service: "nexa-hermes",
      message: "Hermes agent service is currently unreachable.",
      details: error.message
    });
  }
});

app.get("/api/agent/task/:task_id/diff", async (req, res) => {
  const { task_id } = req.params;

  const validIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!task_id || !validIdRegex.test(task_id)) {
    return res.status(400).json({
      status: "error",
      message: "Format task ID tidak sah."
    });
  }

  try {
    const response = await axios.get(`${HERMES_SERVICE_URL}/task/${task_id}/diff`, {
      timeout: 5000
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("[Hermes Agent Diff Error]:", error.message);

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    return res.status(503).json({
      status: "error",
      service: "nexa-hermes",
      message: "Hermes agent service is currently unreachable.",
      details: error.message
    });
  }
});

app.post("/api/agent/task/:task_id/approval", async (req, res) => {
  const { task_id } = req.params;
  const { action } = req.body || {};

  const validIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!task_id || !validIdRegex.test(task_id)) {
    return res.status(400).json({
      status: "error",
      message: "Format task ID tidak sah."
    });
  }

  if (!action || (action !== "approve" && action !== "reject")) {
    return res.status(400).json({
      status: "error",
      message: "Tindakan kelulusan tidak sah. Dijangka 'approve' atau 'reject'."
    });
  }

  try {
    const response = await axios.post(`${HERMES_SERVICE_URL}/task/${task_id}/approval`, {
      action
    }, {
      timeout: 5000
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("[Hermes Agent Approval Error]:", error.message);

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    return res.status(503).json({
      status: "error",
      service: "nexa-hermes",
      message: "Hermes agent service is currently unreachable.",
      details: error.message
    });
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

// Catch-all 404 handler for API routes to prevent falling through to index.html
app.use("/api", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  return res.status(404).json({
    status: "error",
    message: `API route tidak ditemui: ${req.originalUrl}`
  });
});

app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Nexa Server berjalan di port ${port}`);
});
