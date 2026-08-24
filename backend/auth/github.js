const express = require("express");
const axios = require("axios");
const router = express.Router();

// In-memory GitHub session state (server-side)
let currentSession = {
  connected: false,
  username: null,
  accessToken: null,
  user: null
};

// GET /api/auth/github - Initiate GitHub OAuth flow
router.get("/", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/api/auth/github/callback";

  if (!clientId) {
    return res.status(500).json({
      error: "GITHUB_CLIENT_ID tidak ditetapkan dalam persekitaran (environment variables)."
    });
  }

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user`;
  res.redirect(githubAuthUrl);
});

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

    // Save session state securely in backend
    currentSession = {
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

    res.cookie("nexa_github_connected", "true", { httpOnly: false, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.redirect(`/?github_auth=success&username=${encodeURIComponent(userData.login)}`);
  } catch (err) {
    console.error("[GitHub OAuth Callback Exception]", err.message);
    return res.redirect(`/?github_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/auth/github/user - Fetch current GitHub connection status and user info
router.get("/user", (req, res) => {
  if (currentSession.connected) {
    return res.json({
      connected: true,
      username: currentSession.username,
      user: currentSession.user
    });
  }

  return res.json({
    connected: false,
    username: null,
    user: null
  });
});

// POST /api/auth/github/disconnect - Disconnect GitHub account
router.post("/disconnect", (req, res) => {
  currentSession = {
    connected: false,
    username: null,
    accessToken: null,
    user: null
  };

  res.clearCookie("nexa_github_connected");
  return res.json({
    success: true,
    connected: false
  });
});

module.exports = router;
