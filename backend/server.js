const crypto = require("crypto");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getRealtimeClock(clientTime) {
  const fallbackNow = new Date();
  const clientIso = clientTime && typeof clientTime.iso === "string" ? clientTime.iso : null;
  const clientTimezone = clientTime && typeof clientTime.timezone === "string" ? clientTime.timezone : null;
  const now = clientIso && !Number.isNaN(Date.parse(clientIso)) ? new Date(clientIso) : fallbackNow;

  let timezone = "Asia/Kuala_Lumpur";
  if (clientTimezone) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: clientTimezone }).format(now);
      timezone = clientTimezone;
    } catch (_) {
      // Invalid/unavailable device timezone; use Malaysia as a safe fallback.
    }
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    timezone,
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    time: `${values.hour}:${values.minute}:${values.second}`,
    iso: now.toISOString(),
    source: clientIso && clientTimezone ? "device" : "server-fallback"
  };
}

console.log("=================================");
console.log("Nexa Boot");
console.log("=================================");
console.log("OpenRouter Key :", !!process.env.OPENROUTER_KEY);
console.log("PORT           :", process.env.PORT || 3000);
console.log("=================================");

const classifyTask = require("./router");
const { runPipeline } = require("./pipeline/pipeline");
const { handlePostFeedback, handleFeedbackReason } = require("./feedback/feedbackController");
const Brain = require("./brain/brain");
const brainVaultDir = process.env.BRAIN_VAULT_DIR || path.join(__dirname, "brain", "vault");
const brain = new Brain(brainVaultDir);
const { rateLimitBrain, brainNoStore, validateMemoryIdInput, validateVersionInput } = require("./brain/brain_security");
const { requireBrainAuth } = require("./brain/brain_auth");
const { saveGitHubSession, getGitHubSession, clearGitHubSession, ensureSessionId } = require("./github_session");
const { setAuth, getAuth, clearAuth, ensureGuest, getBrainIdentity, registerUser, authenticateUser } = require("./auth/auth");
const { learnFromChat } = require("./brain/learning");
const { getWorkContext, saveWorkContext, formatWorkContext } = require("./brain/workContext");
const { normalizeResponseMode, classifyFastTask } = require("./responseModes");
const { checkRateLimit } = require("./security/rate_limiter");

const app = express();

function getSafeAiErrorMessage(error) {
  const status = Number(error?.response?.status);
  const message = String(error?.message || "").toLowerCase();

  if (status === 429 || /rate.?limit|too many requests|quota/.test(message)) {
    return "Maaf, model sedang rate limit. Cuba lagi sebentar.";
  }

  if (status === 408 || /timeout|timed out|econnaborted|etimedout/.test(message)) {
    return "Maaf, model mengambil terlalu lama untuk merespons. Cuba lagi.";
  }

  if (status >= 500 && status <= 599 || /openrouter|network|socket|econnreset|enotfound|eai_again/.test(message)) {
    return "Maaf, terdapat ralat pada OpenRouter. Cuba lagi sebentar.";
  }

  if (status === 400 || status === 401 || status === 403 || /ralat model|model .*gagal|model .*tidak/.test(message)) {
    return "Maaf, model yang dipilih sedang tidak tersedia atau mengalami ralat. Cuba model lain atau cuba lagi nanti.";
  }

  return "Maaf, berlaku ralat pada model. Cuba lagi sebentar.";
}

function signGitHubOAuthState(state, userId) {
  const secret = process.env.AUTH_SESSION_SECRET || process.env.GITHUB_SESSION_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!secret) throw new Error("OAuth state secret belum dikonfigurasi.");
  return crypto.createHmac("sha256", secret)
    .update(`${state}.${String(userId)}`)
    .digest("hex");
}


app.set("trust proxy", 1);

// Security: restrict browser origins, cap request bodies, and apply baseline
// response headers. Set ALLOWED_ORIGINS as a comma-separated env var in prod.
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0) return callback(null, allowedOrigins.length === 0 && process.env.NODE_ENV !== "production");
    return callback(null, allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

const protectedAuth = (req, res, next) => {
  const session = getAuth(req);
  if (!session) return res.status(401).json({ status: "error", message: "Log masuk AXMchat diperlukan." });
  req.auth = session;
  next();
};

const protectedGithub = (req, res, next) => {
  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ status: "error", message: "Log masuk AXMchat diperlukan." });
  const github = getGitHubSession(req, auth.userId);
  if (!github.connected || !github.accessToken || github.accessToken === "mock_token") {
    return res.status(401).json({ status: "error", message: "Sambungan GitHub diperlukan." });
  }
  req.auth = auth;
  req.github = github;
  next();
};

const authRateLimit = async (req, res, next) => {
  try {
    const result = await checkRateLimit(
      `auth:ip:${String(req.ip || "unknown")}`,
      12,
      10 * 60 * 1000
    );
    if (result.limited) {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ message: "Terlalu banyak percubaan auth. Cuba lagi dalam beberapa minit." });
    }
    return next();
  } catch (error) {
    console.error("[Auth Rate Limit Error]:", error.message);
    return res.status(503).json({ message: "Sistem keselamatan auth tidak tersedia. Cuba lagi." });
  }
};

const chatRateLimit = async (req, res, next) => {
  try {
    const result = await checkRateLimit(
      `chat:ip:${String(req.ip || "unknown")}`,
      30,
      60 * 1000
    );
    if (result.limited) {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ status: "error", message: "Terlalu banyak permintaan chat. Cuba lagi sebentar." });
    }
    return next();
  } catch (error) {
    console.error("[Chat Rate Limit Error]:", error.message);
    return res.status(503).json({ status: "error", message: "Sistem keselamatan chat tidak tersedia. Cuba lagi." });
  }
};

const feedbackRateLimit = async (req, res, next) => {
  try {
    const result = await checkRateLimit(`feedback:ip:${String(req.ip || "unknown")}`, 10, 10 * 60 * 1000);
    if (result.limited) {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ success: false, message: "Terlalu banyak maklum balas. Cuba lagi sebentar." });
    }
    return next();
  } catch (error) {
    console.error("[Feedback Rate Limit Error]:", error.message);
    return res.status(503).json({ success: false, message: "Sistem keselamatan maklum balas tidak tersedia. Cuba lagi." });
  }
};

const distPath = path.join(__dirname, "..", "dist");

// Ensure frontend dist bundle exists, auto-build if missing
if (!fs.existsSync(distPath) || !fs.existsSync(path.join(distPath, "index.html"))) {
  console.log("[Nexa Boot] Dist directory or index.html missing. Building frontend bundle...");
  try {
    execSync("npx vite build", {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit"
    });
  } catch (buildErr) {
    console.error("[Nexa Boot] Failed to build frontend dist bundle:", buildErr.message);
  }
}

app.use(express.static(distPath));

// OAuth URL compatibility: normalize malformed/legacy callback paths before route matching.
app.use((req, res, next) => {
  let pathname = req.originalUrl.split("?")[0];
  try {
    pathname = decodeURIComponent(pathname);
  } catch (_) {
    // Keep the original path when decoding fails.
  }

  if (pathname === "/api/auth github" || pathname === "/api/auth/github/") {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    return res.redirect(302, "/api/auth/github" + query);
  }

  if (pathname === "/auth/github/callback" || pathname === "/auth/github/callback/") {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    return res.redirect(302, "/api/auth/github/callback" + query);
  }

  if (pathname === "/api/auth/github/callback/") {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    return res.redirect(302, "/api/auth/github/callback" + query);
  }

  next();
});

// AXMchat account authentication: Username + Password + Guest
app.get("/api/auth/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const session = getAuth(req);
  return res.json({
    authenticated: !!session,
    type: session?.type || null,
    user: session ? { id: session.userId, name: session.name || session.username || null, username: session.username || null, isGuest: session.type === "guest" } : null
  });
});

app.post("/api/auth/register", authRateLimit, async (req, res) => {
  try {
    const result = await registerUser(req.body?.username, req.body?.password);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    setAuth(res, { type: "user", userId: result.user.id, username: result.user.username, name: result.user.username });
    return res.status(201).json({ authenticated: true, type: "user", user: result.user });
  } catch (err) {
    console.error("[Auth Register Error]:", err.message);
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
      return res.status(503).json({ message: "Penyimpanan akaun production belum dikonfigurasi." });
    }
    return res.status(500).json({ message: "Gagal membuat akaun." });
  }
});

app.post("/api/auth/login", authRateLimit, async (req, res) => {
  try {
    const result = await authenticateUser(req.body?.username, req.body?.password, req.ip || "unknown");
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    setAuth(res, { type: "user", userId: result.user.id, username: result.user.username, name: result.user.username });
    return res.json({ authenticated: true, type: "user", user: result.user });
  } catch (err) {
    console.error("[Auth Login Error]:", err.message);
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
      return res.status(503).json({ message: "Penyimpanan akaun production belum dikonfigurasi." });
    }
    return res.status(500).json({ message: "Gagal log masuk." });
  }
});

app.post("/api/auth/guest", (req, res) => {
  const session = ensureGuest(req, res);
  return res.json({ authenticated: true, type: session.type, user: { id: session.userId, name: session.name, isGuest: true } });
});

app.post("/api/auth/logout", (req, res) => {
  clearGitHubSession(req);
  clearAuth(res);
  return res.json({ authenticated: false });
});

app.post("/api/feedback", feedbackRateLimit, handlePostFeedback);
app.post("/api/feedback/reason", feedbackRateLimit, handleFeedbackReason);

// GET /api/auth/github - Start OAuth flow
app.get("/api/auth/github", protectedAuth, (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL;
  if (!clientId) {
    return res.status(500).json({
      message: "GITHUB_CLIENT_ID belum dikonfigurasi dalam persekitaran server."
    });
  }
  if (!callbackUrl) {
    return res.status(500).json({
      message: "GITHUB_CALLBACK_URL belum dikonfigurasi dalam persekitaran server."
    });
  }
  const state = crypto.randomBytes(32).toString("hex");
  const stateBinding = signGitHubOAuthState(state, req.auth.userId);
  res.cookie("nexa_github_oauth_state", `${state}.${stateBinding}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000
  });
  const redirectUri = encodeURIComponent(callbackUrl);
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo&state=${encodeURIComponent(state)}`;
  return res.redirect(githubAuthUrl);
});

// GET /api/auth/github/callback - Handle OAuth callback
app.get("/api/auth/github/callback", protectedAuth, async (req, res) => {
  const { code, state } = req.query;
  const expectedStateCookie = req.cookies?.nexa_github_oauth_state;
  const [expectedState, expectedBinding] = typeof expectedStateCookie === "string"
    ? expectedStateCookie.split(".")
    : [];
  let stateValid = false;
  try {
    const expected = expectedState && expectedBinding
      ? signGitHubOAuthState(expectedState, req.auth.userId)
      : "";
    stateValid = typeof state === "string" &&
      typeof expectedState === "string" &&
      typeof expectedBinding === "string" &&
      state.length === expectedState.length &&
      expectedBinding.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState)) &&
      crypto.timingSafeEqual(Buffer.from(expectedBinding), Buffer.from(expected));
  } catch (_) {
    stateValid = false;
  }
  if (!code || !stateValid) {
    return res.status(400).send("Permintaan OAuth GitHub tidak sah atau telah tamat.");
  }
  res.clearCookie("nexa_github_oauth_state", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
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
      ownerUserId: req.auth.userId,
      connected: true,
      username: userRes.data.login,
      accessToken: accessToken,
      user: { login: userRes.data.login, name: userRes.data.name }
    };

    saveGitHubSession(req, sessionData);

    // Redirect to frontend root
    return res.redirect("/");
  } catch (err) {
    console.error("[GitHub OAuth Callback Error]:", err.message);
    return res.status(502).send("Gagal melengkapkan sambungan GitHub. Cuba sambung semula.");
  }
});

// GET /api/auth/github/status - Safe connection status check (never exposes token)
app.get("/api/auth/github/status", protectedAuth, (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const session = getGitHubSession(req, req.auth.userId);
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
app.post("/api/auth/github/disconnect", protectedAuth, (req, res) => {
  clearGitHubSession(req);
  return res.status(200).json({ connected: false, message: "Akaun GitHub berjaya dilog keluar." });
});

// GET /api/github/repos - Authenticated read-only repository list
app.get("/api/github/repos", protectedGithub, async (req, res) => {
  const session = getGitHubSession(req, req.auth.userId);

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
      repos: []
    });
  }
});

// Brain Memory Intelligence API (authenticated user scope)
app.get("/api/brain/health", brainNoStore, rateLimitBrain("read"), requireBrainAuth((req) => getAuth(req)), async (req, res) => {
  try {
    const health = brain.inspectMemoryHealth({ scope: req.brainUser, staleDays: 180 });
    return res.status(200).json({ status: "ok", scope: req.brainUser, health });
  } catch (error) {
    console.error("[Brain Health Error]:", error.message);
    return res.status(500).json({
      status: "error",
      message: process.env.NODE_ENV === "production" ? "Ralat dalaman Brain." : error.message
    });
  }
});

// Brain Memory History API (authenticated user scope)
app.get("/api/brain/history", brainNoStore, rateLimitBrain("read"), requireBrainAuth((req) => getAuth(req)), async (req, res) => {
  const memoryId = typeof req.query.memory_id === "string" ? req.query.memory_id.trim() : "";
  if (!validateMemoryIdInput(memoryId)) return res.status(400).json({ status: "error", message: "memory_id tidak sah." });
  try {
    const history = brain.getMemoryHistory(memoryId, { scope: req.brainUser });
    return res.status(200).json({ status: "ok", memoryId, history });
  } catch (error) {
    console.error("[Brain History Error]:", error.message);
    return res.status(400).json({
      status: "error",
      message: process.env.NODE_ENV === "production" ? "Permintaan Brain tidak dapat diproses." : error.message
    });
  }
});

app.post("/api/brain/history/restore", brainNoStore, rateLimitBrain("restore"), requireBrainAuth((req) => getAuth(req)), async (req, res) => {
  const { memory_id, version } = req.body || {};
  if (!validateMemoryIdInput(memory_id) || !validateVersionInput(version)) {
    return res.status(400).json({ status: "error", message: "memory_id dan version yang sah diperlukan." });
  }
  try {
    const result = await brain.restoreMemory(memory_id.trim(), Number(version), { scope: req.brainUser });
    return res.status(200).json({ status: "ok", result });
  } catch (error) {
    console.error("[Brain Restore Error]:", error.message);
    return res.status(400).json({
      status: "error",
      message: process.env.NODE_ENV === "production" ? "Permintaan Brain tidak dapat diproses." : error.message
    });
  }
});


/**
 * Brain Memory List API.
 * Uses the same stable per-browser Brain identity as /chat.
 */
app.get("/api/brain/memories", brainNoStore, rateLimitBrain("read"), async (req, res) => {
  try {
    const scope = getBrainIdentity(req, res);
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    const memories = await brain.listMemories({ scope, limit });
    return res.status(200).json({ status: "ok", scope, memories });
  } catch (error) {
    console.error("[Brain Memory List Error]:", error.message);
    return res.status(500).json({
      status: "error",
      message: process.env.NODE_ENV === "production" ? "Ralat dalaman Brain." : error.message
    });
  }
});

/**
 * Brain Memory Delete API.
 * Deletes only a memory belonging to the current browser Brain scope.
 * History snapshots are retained for audit/restore.
 */
app.delete("/api/brain/memories/:memory_id", brainNoStore, rateLimitBrain("delete"), async (req, res) => {
  const memoryId = typeof req.params.memory_id === "string" ? req.params.memory_id.trim() : "";
  if (!validateMemoryIdInput(memoryId)) {
    return res.status(400).json({ status: "error", message: "memory_id tidak sah." });
  }

  try {
    const scope = getBrainIdentity(req, res);
    const result = await brain.deleteMemory(memoryId, { scope });
    return res.status(200).json({ status: "ok", result });
  } catch (error) {
    console.error("[Brain Memory Delete Error]:", error.message);
    const status = /not found/i.test(error.message) ? 404 : /Unauthorized|Security Violation/i.test(error.message) ? 403 : 400;
    return res.status(status).json({ status: "error", message: error.message });
  }
});

app.post("/api/brain/memories/reset", brainNoStore, rateLimitBrain("restore"), requireBrainAuth((req) => getAuth(req)), async (req, res) => {
  try {
    const scope = { type: "user", userId: req.brainUser.userId };
    const result = await brain.deleteAllMemories({
      scope
    });
    return res.status(200).json({
      status: "ok",
      deleted: Number(result?.deleted) || 0,
      message: "Semua memori aktif AXMchat telah direset."
    });
  } catch (error) {
    console.error("[Brain Memory Reset Error]:", error.message);
    return res.status(500).json({
      status: "error",
      message: process.env.NODE_ENV === "production" ? "Ralat dalaman Brain." : error.message
    });
  }
});

app.post("/chat", chatRateLimit, async (req, res) => {
  const rawQuestion = req.body?.question;
  const question = typeof rawQuestion === "string" ? rawQuestion.trim().slice(0, 12000) : "";
  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  const history = rawHistory
    .filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-20)
    .map(item => ({ role: item.role, content: item.content.slice(0, 6000) }));

  // Brain identity is independent from GitHub authentication. The same
  // httpOnly session cookie is reused across chat requests, so memory can
  // persist across new chats without requiring GitHub login.
  const brainScope = getBrainIdentity(req, res);
  const brainUserId = brainScope.userId;

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
    const aiAvailability = {
      general: req.body?.aiAvailability?.general !== false,
      coding: req.body?.aiAvailability?.coding !== false,
      fallback: req.body?.aiAvailability?.fallback !== false
    };

    if (!aiAvailability.general && !aiAvailability.coding && !aiAvailability.fallback) {
      return sendError("Semua AI AXMchat dimatikan. Hidupkan sekurang-kurangnya satu AI untuk meneruskan.");
    }

    const responseMode = normalizeResponseMode(req.body?.responseMode);
    const memoryEnabled = req.body?.memoryEnabled !== false;

    // Fast mode intentionally avoids the expensive context/retrieval/classifier
    // chain. It uses deterministic local task detection and goes straight to
    // the selected model through the Fast pipeline path.
    let sharedWorkContext = null;
    let brainContext = null;
    let task;

    // Brain retrieval must work in every response mode. Fast mode may skip
    // the expensive classifier, but it must never skip the user's persistent
    // memory; otherwise the Memory Toggle appears broken in Fast mode.
    if (memoryEnabled) {
      try {
        if (responseMode !== "fast") sendStatus("Mencari konteks Brain...");
        brainContext = await brain.retrieveContext(question.trim(), {
          scope: brainScope,
          topK: 5,
          maxSources: 8,
          maxContextChars: 5000,
          forceRecall: /\\b(ingat|ingat lagi|masih ingat|apa yang kau tahu tentang aku|apa yang kamu tahu tentang aku|apa yang anda tahu tentang saya|siapa saya|tentang saya|memori|memory|asal saya|orang mana|nama saya|umur saya|suka apa|minat saya)\\b/i.test(question.trim())
        });
      } catch (brainError) {
        console.warn("[Brain Chat Retrieval Warning]:", brainError.message);
      }
    }

    if (responseMode === "fast") {
      task = classifyFastTask(question);
      if (task === "code" && !aiAvailability.coding) task = "general";
      if (task === "general" && !aiAvailability.general) task = "code";
      sendStatus("Fast mode: laluan terus...");
    } else {
      // Shared Work Context connects General and Coding AI across chats.
      try {
        sharedWorkContext = await getWorkContext(brainUserId);
        if (sharedWorkContext) sendStatus("Menyambung Shared Work Context...");
      } catch (workContextError) {
        console.warn("[WorkContext Retrieval Warning]:", workContextError.message);
      }

      sendStatus("Mengelaskan permintaan...");
      task = await classifyTask(question, history);
      if (task === "code" && !aiAvailability.coding) task = "general";
      if (task === "general" && !aiAvailability.general) task = "code";
    }

    const mainAiDisabled = !aiAvailability.general && !aiAvailability.coding;
    const forcedAiTask = mainAiDisabled ? "fallback" : (!aiAvailability.general ? "code" : (!aiAvailability.coding ? "general" : null));
    if (mainAiDisabled && !aiAvailability.fallback) {
      return sendError("General AI, Coding AI dan Fallback AI semuanya dimatikan.");
    }
    if (mainAiDisabled) {
      task = "fallback";
    }

    const responseModeContext = {
      fast: "[AXMCHAT RESPONSE MODE]\nMode: Fast\nPrioritize speed with a direct single-pass response.\n[END AXMCHAT RESPONSE MODE]",
      balance: "[AXMCHAT RESPONSE MODE]\nMode: Balance\nBalance response speed, reasoning depth, clarity, and completeness. This is the default everyday mode.\n[END AXMCHAT RESPONSE MODE]",
      thinking: "[AXMCHAT RESPONSE MODE]\nMode: Thinking\nUse deeper reasoning before answering. Carefully check assumptions, calculations, code, edge cases, and instructions. Prefer correctness and completeness over speed.\n[END AXMCHAT RESPONSE MODE]"
    }[responseMode];

    // Make authoritative request-time clock data available to every execution path:
    // General AI, Coding AI, and Fallback AI. The model must use it when asked
    // about the current day/date/time, but must never volunteer it otherwise.
    const realtimeClock = getRealtimeClock(req.body && req.body.clientTime);
    // Keep the selected model completely system-prompt-free. When the user
    // explicitly asks for the current time/date, add authoritative runtime
    // data to that request only; otherwise the model receives no AXM identity
    // or runtime instructions.
    // Detect time/date requests broadly. Keep the model system-prompt-free;
    // authoritative clock data is added to the actual request only when needed.
    const normalizedTimeQuestion = question.trim();
    const hasClockWord = /\b(jam|waktu|pukul|masa|time)\b/i.test(normalizedTimeQuestion);
    const hasDateWord = /\b(hari|tanggal|tarikh|date|today)\b/i.test(normalizedTimeQuestion);
    const hasTimeQuestionForm = /\b(berapa|sekarang|kini|now|current)\b/i.test(normalizedTimeQuestion);
    const hasDateQuestionForm = /\b(apa|berapa|hari ini|today|sekarang|kini|now|current)\b/i.test(normalizedTimeQuestion);
    const timeQuestion =
      (hasClockWord && hasTimeQuestionForm) ||
      (hasDateWord && hasDateQuestionForm);

    const realtimeClockContext = `[AXMCHAT REAL-TIME CLOCK]
Timezone: ${realtimeClock.timezone}
Date: ${realtimeClock.date}
Day: ${realtimeClock.weekday}
Time: ${realtimeClock.time}
ISO: ${realtimeClock.iso}
IMPORTANT: This is authoritative current-time data generated at request time. General AI, Coding AI, and Fallback AI may use this data. When the user asks what day/date/time it is, answer directly from this data. Do not claim to lack real-time access, do not ask for the user's location/timezone when this data is present, and do not mention or volunteer the clock data for unrelated questions.
[END AXMCHAT REAL-TIME CLOCK]`;

    const sharedWorkPrompt = formatWorkContext(sharedWorkContext);
    const contextBlocks = responseMode === "fast"
      ? [realtimeClockContext]
      : [responseModeContext, realtimeClockContext, sharedWorkPrompt].filter(Boolean);

    // Only inject Brain memory when the current message is meaningfully
    // related to personal context. Generic greetings/small talk must not leak
    // unrelated memories such as the user's country.
    const memoryRelevant = (() => {
      const text = question.trim().toLowerCase();
      if (!text) return false;
      const smallTalk = /^(hi|hello|hey|hai|helo|yo|yoo|e(y|i)o|oi|woy|bro|wak|cuy|kawan|terima kasih|thanks|thank you|thx|ok|okay|oke|baik|selamat pagi|selamat petang|selamat malam|good morning|good afternoon|good evening)[!,.\\s]*$/i;
      if (smallTalk.test(text)) return false;
      // Explicit self/memory questions should always be allowed to use Brain.
      if (/(aku|saya|kamu|anda|diri saya|tentang saya|ingat|memori|memory|siapa saya|orang mana|asal saya|tinggal di|suka apa|minat saya|umur saya|nama saya)/i.test(text)) return true;
      // For ordinary questions, require lexical overlap with retrieved memory.
      const memoryText = String(brainContext?.context || "").toLowerCase();
      if (!memoryText) return false;
      const tokens = text.match(/[a-z0-9À-ÿ]{3,}/g) || [];
      const stop = new Set(["yang","dan","atau","dengan","untuk","dari","pada","dalam","itu","ini","apa","ada","tak","tidak","nak","mau","boleh","saya","aku","kau","kamu","anda"]);
      return tokens.filter(token => !stop.has(token)).some(token => memoryText.includes(token));
    })();

    if (memoryRelevant && brainContext && brainContext.context && brainContext.sources && brainContext.sources.length) {
      contextBlocks.push(`[AXMCHAT BRAIN CONTEXT]
IMPORTANT: This is trusted user memory relevant to the current request. Use it only when it directly helps answer the user's question. Never mention, quote, summarize, or announce hidden memory/context unless the user explicitly asks about their memory or how AXMchat remembers them. Never say "you said you are..." merely because a memory was retrieved.
${brainContext.context}
[END AXMCHAT BRAIN CONTEXT]`);
    }

    // Keep internal context in the system instruction, never in the user message.
    // This prevents the model from treating clock/brain metadata as something
    // the user said and stops it from echoing that metadata on ordinary prompts.
    const internalSystemContext = contextBlocks.filter(Boolean).join("\n\n");

    const modelQuestion = timeQuestion
      ? question.trim() +
        "\n\n[CURRENT DATE/TIME — AUTHORITATIVE REQUEST DATA]\n" +
        "Date: " + realtimeClock.date + "\n" +
        "Day: " + realtimeClock.weekday + "\n" +
        "Time: " + realtimeClock.time + "\n" +
        "Timezone: " + realtimeClock.timezone + "\n" +
        "Answer the user's time/date question directly using these values. Do not say that you lack real-time access when these values are present.\n" +
        "[END CURRENT DATE/TIME]"
      : question.trim();

    const answer = await runPipeline({
      task,
      question: modelQuestion,
      history,
      generalModel,
      codingModel,
      fallbackModel,
      fallbackEnabled: aiAvailability.fallback,
      internalSystemContext,
      forcedTask: forcedAiTask,
      aiAvailability,
      responseMode,
      sendStatus,
      sendProcessStep
    });

    // Fast mode returns immediately after the model response. Persistence and
    // learning continue in the background so they cannot hold up the user-visible latency.
    if (responseMode === "fast") {
      sendAnswer(answer);

      void saveWorkContext(brainUserId, {
        lastTaskType: task,
        lastQuestion: question,
        lastAnswer: answer,
        currentTask: question
      }).catch((workContextError) => {
        console.warn("[Fast WorkContext Save Warning]:", workContextError.message);
      });

      if (memoryEnabled) void learnFromChat(brain, question, brainScope, {
        mode: process.env.BRAIN_MEMORY_MODE || "auto",
        confidenceThreshold: 0.75,
        maxMemories: 3
      }).catch((learningError) => {
        console.warn("[Fast Brain Learning Warning]:", learningError.message);
      });

      return;
    }

    // Persist this exchange as shared working state for both AI roles.
    try {
      await saveWorkContext(brainUserId, {
        lastTaskType: task,
        lastQuestion: question,
        lastAnswer: answer,
        currentTask: question
      });
    } catch (workContextError) {
      console.warn("[WorkContext Save Warning]:", workContextError.message);
    }

    // Brain Learning Loop: learn only durable information from the user's
    // own message, scoped to the stable Brain user identity. GitHub is not
    // required for personal memory. The assistant response is never persisted.
    if (memoryEnabled) try {
      const learning = await learnFromChat(brain, question, brainScope, {
        mode: process.env.BRAIN_MEMORY_MODE || "auto",
        confidenceThreshold: 0.75,
        maxMemories: 3
      });

      if (learning.updated) {
        sendStatus("Brain mengemas kini " + learning.updated + " memori.");
      }
      if (learning.consolidated && learning.consolidated.length) {
        sendStatus("Brain menggabungkan " + learning.consolidated.length + " memori berkaitan.");
      } else if (learning.saved && learning.saved.some(item => item.created)) {
        sendStatus(
          "Brain menyimpan " +
          learning.saved.filter(item => item.created).length +
          " memori."
        );
      }
    } catch (learningError) {
      console.warn("[Brain Learning Loop Warning]:", learningError.message);
    }

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
      process.env.NODE_ENV === "production"
        ? getSafeAiErrorMessage(error)
        : (error.message || "Ada masalah pada server.")
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
