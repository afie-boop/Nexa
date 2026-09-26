const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SESSION_COOKIE = "nexa_session_id";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_ID_RE = /^[a-f0-9]{64}$/;

function getSessionDir() {
  const dir = path.join(__dirname, "feedback", "data", "sessions");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getSessionId(req) {
  const value = req && req.cookies ? req.cookies[SESSION_COOKIE] : null;
  return typeof value === "string" && SESSION_ID_RE.test(value) ? value : null;
}

function createSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS
  });
}

function sessionPath(sessionId) {
  return path.join(getSessionDir(), `${sessionId}.json`);
}

function saveGitHubSession(req, sessionData) {
  try {
    let sessionId = getSessionId(req);
    if (!sessionId) sessionId = createSessionId();

    const safeData = {
      connected: !!sessionData.connected,
      username: typeof sessionData.username === "string" ? sessionData.username : null,
      accessToken: typeof sessionData.accessToken === "string" ? sessionData.accessToken : null,
      user: sessionData.user || null,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(sessionPath(sessionId), JSON.stringify(safeData), "utf8");
    setSessionCookie(req.res, sessionId);
    return sessionId;
  } catch (err) {
    console.error("[GitHub Session Write Error]:", err.message);
    return null;
  }
}

function getGitHubSession(req) {
  try {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      return { connected: false, username: null, accessToken: null };
    }

    const file = sessionPath(sessionId);
    if (!fs.existsSync(file)) {
      return { connected: false, username: null, accessToken: null };
    }

    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const updatedAt = Date.parse(parsed.updatedAt || "");
    if (!updatedAt || Date.now() - updatedAt > SESSION_TTL_MS) {
      try { fs.unlinkSync(file); } catch (_) {}
      return { connected: false, username: null, accessToken: null };
    }

    if (parsed.connected && parsed.accessToken && parsed.accessToken !== "mock_token") {
      return parsed;
    }
  } catch (err) {
    console.error("[GitHub Session Read Error]:", err.message);
  }
  return { connected: false, username: null, accessToken: null };
}

function clearGitHubSession(req) {
  try {
    const sessionId = getSessionId(req);
    if (sessionId) {
      const file = sessionPath(sessionId);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    req.res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
  } catch (err) {
    console.error("[GitHub Session Clear Error]:", err.message);
  }
}

module.exports = {
  saveGitHubSession,
  getGitHubSession,
  clearGitHubSession
};
