const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const SESSIONS_FILE = path.join(__dirname, "..", "feedback", "data", "github_sessions.json");

// Ensure data directory exists
const dataDir = path.dirname(SESSIONS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory cache for fast session access
let memorySessions = null;

function loadAllSessions() {
  if (memorySessions !== null) {
    return memorySessions;
  }
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, "utf-8");
      memorySessions = JSON.parse(data);
      return memorySessions;
    }
  } catch (err) {
    console.error("[GitHub Auth] Error reading sessions file:", err.message);
  }
  memorySessions = {};
  return memorySessions;
}

function saveAllSessions(sessions) {
  memorySessions = sessions;
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("[GitHub Auth] Error saving sessions file:", err.message);
  }
}

function isRequestSecure(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
}

// Helper to get session ID from request cookie or generate a new one
function getSessionId(req, res) {
  let sessionId = req.cookies ? req.cookies.nexa_session_id : null;
  if (!sessionId) {
    sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    const isSecure = isRequestSecure(req);
    res.cookie("nexa_session_id", sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
  }
  return sessionId;
}

// Helper to load session data for a specific request or sessionId
function loadSession(req, explicitSessionId = null) {
  const sessionId = explicitSessionId || (req.cookies ? req.cookies.nexa_session_id : null);
  if (!sessionId) {
    return {
      sessionId: null,
      connected: false,
      username: null,
      accessToken: null,
      user: null,
      selectedRepo: null
    };
  }
  const sessions = loadAllSessions();
  const session = sessions[sessionId];
  if (session) {
    return { sessionId, ...session };
  }
  return {
    sessionId,
    connected: false,
    username: null,
    accessToken: null,
    user: null,
    selectedRepo: null
  };
}

// Helper to save session data for a specific request
function saveSession(sessionId, sessionData) {
  if (!sessionId) return;
  const sessions = loadAllSessions();
  sessions[sessionId] = sessionData;
  saveAllSessions(sessions);
  console.log("[GitHub Auth] Session state saved for session:", sessionId, "| User:", sessionData.username || "none");
}

// Helper to remove session data for a specific request
function deleteSession(sessionId) {
  if (!sessionId) return;
  const sessions = loadAllSessions();
  delete sessions[sessionId];
  saveAllSessions(sessions);
  console.log("[GitHub Auth] Session deleted for session:", sessionId);
}

// GET /api/github/login or /api/auth/github - Initiate GitHub OAuth flow
router.get("/login", (req, res) => handleOAuthRedirect(req, res));
router.get("/", (req, res) => handleOAuthRedirect(req, res));

function handleOAuthRedirect(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/api/auth/github/callback";

  console.log("[GitHub OAuth Init] Client ID present:", !!clientId, "| Callback URL:", callbackUrl);

  if (!clientId) {
    console.error("[GitHub OAuth Init Error] GITHUB_CLIENT_ID missing in environment variables.");
    return res.status(500).json({
      error: "GITHUB_CLIENT_ID tidak ditetapkan dalam persekitaran (environment variables)."
    });
  }

  // Include repo scope so public and private repos can be accessed
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user%20repo`;
  res.redirect(githubAuthUrl);
}

// GET /api/auth/github/callback - Handle GitHub OAuth callback
router.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  console.log("[GitHub OAuth Callback] Callback received | Code present:", !!code, "| Error query:", error || "none");

  if (error || !code) {
    console.error("[GitHub OAuth Callback Error] Code missing or authorization denied:", error || "no_code");
    return res.redirect(`/?github_error=${encodeURIComponent(error || "no_code")}`);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/api/auth/github/callback";

  if (!clientId || !clientSecret) {
    console.error("[GitHub OAuth Callback Error] Client ID or Client Secret missing on server.");
    return res.redirect("/?github_error=missing_credentials");
  }

  try {
    console.log("[GitHub OAuth Callback] Exchanging authorization code for access token...");
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl
      },
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      console.error("[GitHub OAuth Callback Error] Token exchange response did not contain access token.");
      return res.redirect("/?github_error=token_exchange_failed");
    }

    console.log("[GitHub OAuth Callback] Access token received successfully. Fetching user profile...");

    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Nexa-AI-App"
      }
    });

    const userData = userResponse.data;
    console.log("[GitHub OAuth Callback] GitHub user fetched successfully:", userData.login);

    const sessionId = getSessionId(req, res);
    const currentData = loadSession(req, sessionId);

    const sessionData = {
      connected: true,
      username: userData.login,
      accessToken: accessToken,
      user: {
        login: userData.login,
        name: userData.name,
        avatar_url: userData.avatar_url,
        id: userData.id
      },
      selectedRepo: currentData.selectedRepo || null
    };

    saveSession(sessionId, sessionData);

    const isSecure = isRequestSecure(req);
    res.cookie("nexa_github_connected", "true", {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    console.log("[GitHub OAuth Callback] Redirecting client to Nexa frontend with success flag...");
    return res.redirect(`/?github_auth=success&username=${encodeURIComponent(userData.login)}`);
  } catch (err) {
    console.error("[GitHub OAuth Callback Exception]", err.message);
    return res.redirect(`/?github_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/github/status or /api/auth/github/user - Fetch current GitHub connection status and user info
router.get("/status", (req, res) => handleGetStatus(req, res));
router.get("/user", (req, res) => handleGetStatus(req, res));

function handleGetStatus(req, res) {
  const sessionId = getSessionId(req, res);
  const session = loadSession(req, sessionId);
  const isConnected = !!(session && session.connected);
  console.log("[GitHub Status Check] Session ID:", sessionId, "| Connected:", isConnected, "| Username:", session?.username || "none");

  if (isConnected) {
    return res.json({
      connected: true,
      username: session.username,
      user: session.user,
      selectedRepo: session.selectedRepo || null
    });
  }

  return res.json({
    connected: false,
    username: null,
    user: null,
    selectedRepo: null
  });
}

// GET /api/github/repos or /api/auth/github/repos - Fetch repositories for authenticated GitHub user
router.get("/repos", (req, res) => handleGetRepos(req, res));

async function handleGetRepos(req, res) {
  const session = loadSession(req);
  if (!session || !session.connected || !session.accessToken) {
    console.error("[GitHub Repos Error] User is not connected or token is missing.");
    return res.status(401).json({ error: "Sila log masuk dengan GitHub terlebih dahulu." });
  }

  try {
    console.log("[GitHub Repos] Fetching user repositories from GitHub API for user:", session.username);
    const reposResponse = await axios.get("https://api.github.com/user/repos?sort=updated&per_page=100", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "User-Agent": "Nexa-AI-App"
      }
    });

    const repos = reposResponse.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url
      },
      private: repo.private,
      description: repo.description,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
      updated_at: repo.updated_at
    }));

    console.log("[GitHub Repos] Successfully fetched", repos.length, "repositories.");
    return res.json({
      success: true,
      repositories: repos
    });
  } catch (err) {
    console.error("[GitHub Repos Exception]", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data?.message || "Gagal mengambil senarai repositori dari GitHub."
    });
  }
}

// POST /api/github/select-repo or /api/auth/github/select-repo - Select active repository
router.post("/select-repo", (req, res) => handleSelectRepo(req, res));

function handleSelectRepo(req, res) {
  const session = loadSession(req);
  if (!session || !session.connected) {
    return res.status(401).json({ error: "Sila log masuk dengan GitHub terlebih dahulu." });
  }

  const { repo } = req.body;
  if (!repo || !repo.full_name) {
    return res.status(400).json({ error: "Maklumat repositori tidak sah." });
  }

  const selectedRepo = {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    owner: repo.owner?.login || repo.owner,
    private: !!repo.private,
    html_url: repo.html_url,
    default_branch: repo.default_branch
  };

  session.selectedRepo = selectedRepo;
  saveSession(session.sessionId, session);

  console.log("[GitHub Select Repo] Selected repository updated to:", selectedRepo.full_name);

  return res.json({
    success: true,
    selectedRepo
  });
}

// POST /api/github/disconnect or /api/auth/github/disconnect - Disconnect GitHub account
router.post("/disconnect", (req, res) => handleDisconnect(req, res));

function handleDisconnect(req, res) {
  const sessionId = req.cookies ? req.cookies.nexa_session_id : null;
  console.log("[GitHub Disconnect] Disconnecting user session ID:", sessionId);
  if (sessionId) {
    deleteSession(sessionId);
  }

  res.clearCookie("nexa_session_id", { path: "/" });
  res.clearCookie("nexa_github_connected", { path: "/" });
  return res.json({
    success: true,
    connected: false
  });
}

module.exports = router;
