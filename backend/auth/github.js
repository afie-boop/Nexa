const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const SESSION_FILE = path.join(__dirname, "..", "feedback", "data", "github_session.json");

// Ensure data directory exists
const dataDir = path.dirname(SESSION_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Helper to load session state from JSON file
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[GitHub Auth] Gagal membaca session file:", err.message);
  }
  return {
    connected: false,
    username: null,
    accessToken: null,
    user: null
  };
}

// Helper to save session state to JSON file
function saveSession(sessionData) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), "utf-8");
  } catch (err) {
    console.error("[GitHub Auth] Gagal menyimpan session file:", err.message);
  }
}

// GET /api/github/login or /api/auth/github - Initiate GitHub OAuth flow
router.get("/login", (req, res) => handleOAuthRedirect(req, res));
router.get("/", (req, res) => handleOAuthRedirect(req, res));

function handleOAuthRedirect(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/api/auth/github/callback";

  if (!clientId) {
    return res.status(500).json({
      error: "GITHUB_CLIENT_ID tidak ditetapkan dalam persekitaran (environment variables)."
    });
  }

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user`;
  res.redirect(githubAuthUrl);
}

// GET /api/auth/github/callback - Handle GitHub OAuth callback
router.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    console.error("[GitHub OAuth Error]", error || "Kod kebenaran tidak ditemui.");
    return res.redirect(`/?github_error=${encodeURIComponent(error || "no_code")}`);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/api/auth/github/callback";

  if (!clientId || !clientSecret) {
    console.error("[GitHub OAuth Error] GITHUB_CLIENT_ID atau GITHUB_CLIENT_SECRET tidak wujud.");
    return res.redirect("/?github_error=missing_credentials");
  }

  try {
    // Exchange code for access token
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
      console.error("[GitHub OAuth Error] Gagal mendapatkan access_token:", tokenResponse.data);
      return res.redirect("/?github_error=token_exchange_failed");
    }

    // Get user details from GitHub API
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Nexa-AI-App"
      }
    });

    const userData = userResponse.data;

    // Save session state securely in backend JSON file
    const sessionData = {
      connected: true,
      username: userData.login,
      accessToken: accessToken,
      user: {
        login: userData.login,
        name: userData.name,
        avatar_url: userData.avatar_url,
        id: userData.id
      }
    };

    saveSession(sessionData);

    res.cookie("nexa_github_connected", "true", { httpOnly: false, maxAge: 30 * 24 * 60 * 60 * 1000 });
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
  const session = loadSession();
  if (session && session.connected) {
    return res.json({
      connected: true,
      username: session.username,
      user: session.user
    });
  }

  return res.json({
    connected: false,
    username: null,
    user: null
  });
}

// POST /api/github/disconnect or /api/auth/github/disconnect - Disconnect GitHub account
router.post("/disconnect", (req, res) => handleDisconnect(req, res));

function handleDisconnect(req, res) {
  saveSession({
    connected: false,
    username: null,
    accessToken: null,
    user: null
  });

  res.clearCookie("nexa_github_connected");
  return res.json({
    success: true,
    connected: false
  });
}

module.exports = router;
