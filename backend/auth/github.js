const express = require("express");
const axios = require("axios");
const router = express.Router();

// In-memory GitHub session state (server-side)
let currentSession = {
  connected: false,
  username: null,
  accessToken: null,
  user: null,
  selectedRepo: null
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

  // Request repo scope to allow reading user's public and private repositories
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user%20repo`;
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
      },
      selectedRepo: currentSession.selectedRepo || null
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
      user: currentSession.user,
      selectedRepo: currentSession.selectedRepo
    });
  }

  return res.json({
    connected: false,
    username: null,
    user: null,
    selectedRepo: null
  });
});

// GET /api/auth/github/repos - Fetch repositories for authenticated GitHub user
router.get("/repos", async (req, res) => {
  if (!currentSession.connected || !currentSession.accessToken) {
    return res.status(401).json({ error: "Sila log masuk dengan GitHub terlebih dahulu." });
  }

  try {
    const reposResponse = await axios.get("https://api.github.com/user/repos?sort=updated&per_page=100", {
      headers: {
        Authorization: `Bearer ${currentSession.accessToken}`,
        "User-Agent": "Nexa-AI-App"
      }
    });

    // Format repository list cleanly without exposing sensitive tokens
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

    return res.json({
      success: true,
      repositories: repos
    });
  } catch (err) {
    console.error("[GitHub Repos Error]", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data?.message || "Gagal mengambil senarai repositori dari GitHub."
    });
  }
});

// POST /api/auth/github/select-repo - Select a repository as current active session repository
router.post("/select-repo", (req, res) => {
  if (!currentSession.connected) {
    return res.status(401).json({ error: "Sila log masuk dengan GitHub terlebih dahulu." });
  }

  const { repo } = req.body;
  if (!repo || !repo.full_name) {
    return res.status(400).json({ error: "Maklumat repositori tidak sah." });
  }

  currentSession.selectedRepo = {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    owner: repo.owner?.login || repo.owner,
    private: !!repo.private,
    html_url: repo.html_url,
    default_branch: repo.default_branch
  };

  return res.json({
    success: true,
    selectedRepo: currentSession.selectedRepo
  });
});

// POST /api/auth/github/disconnect - Disconnect GitHub account
router.post("/disconnect", (req, res) => {
  currentSession = {
    connected: false,
    username: null,
    accessToken: null,
    user: null,
    selectedRepo: null
  };

  res.clearCookie("nexa_github_connected");
  return res.json({
    success: true,
    connected: false
  });
});

module.exports = router;
