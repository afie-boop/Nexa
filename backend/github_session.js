const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SESSION_COOKIE = "nexa_session_id";
const GITHUB_COOKIE = "nexa_github_session_v2";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_ID_RE = /^[a-f0-9]{64}$/;

function getSessionDir() {
  const dir = process.env.GITHUB_SESSION_DIR
    ? path.resolve(process.env.GITHUB_SESSION_DIR)
    : path.join(__dirname, "feedback", "data", "sessions");
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

function ensureSessionId(req) {
  const existing = getSessionId(req);
  if (existing) return existing;

  const sessionId = createSessionId();
  setSessionCookie(req.res, sessionId);
  return sessionId;
}

function getCookieSecret() {
  const value = process.env.GITHUB_SESSION_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("GITHUB_SESSION_SECRET atau GITHUB_CLIENT_SECRET mesti ditetapkan dalam production.");
  }
  return value || "dev-only-change-me-nexa-github-session";
}

function encryptSession(data) {
  const key = crypto.createHash("sha256").update(getCookieSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptSession(value) {
  try {
    const raw = Buffer.from(String(value || ""), "base64url");
    if (raw.length < 28) return null;
    const key = crypto.createHash("sha256").update(getCookieSecret()).digest();
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  } catch (_) {
    return null;
  }
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

function setGitHubCookie(res, sessionData) {
  // Deliberately store only a short-lived connection marker in the browser.
  // The GitHub access token remains server-side in the session file.
  const marker = {
    connected: !!sessionData.connected,
    ownerUserId: typeof sessionData.ownerUserId === "string" ? sessionData.ownerUserId : null,
    username: typeof sessionData.username === "string" ? sessionData.username : null,
    updatedAt: new Date().toISOString()
  };
  res.cookie(GITHUB_COOKIE, encryptSession(marker), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS
  });
}

function clearGitHubCookie(res) {
  res.clearCookie(GITHUB_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
}

function sessionPath(sessionId) {
  return path.join(getSessionDir(), `${sessionId}.json`);
}

function saveGitHubSession(req, sessionData) {
  try {
    let sessionId = getSessionId(req);
    if (!sessionId) sessionId = createSessionId();

    const safeData = {
      ownerUserId: typeof sessionData.ownerUserId === "string" ? sessionData.ownerUserId : null,
      connected: !!sessionData.connected,
      username: typeof sessionData.username === "string" ? sessionData.username : null,
      accessToken: typeof sessionData.accessToken === "string" ? sessionData.accessToken : null,
      user: sessionData.user || null,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(sessionPath(sessionId), JSON.stringify(safeData), "utf8");
    setSessionCookie(req.res, sessionId);
    // Render Free has an ephemeral filesystem. Keep an encrypted copy in the browser
    // so a restart/redeploy does not disconnect the user from GitHub.
    setGitHubCookie(req.res, safeData);
    return sessionId;
  } catch (err) {
    console.error("[GitHub Session Write Error]:", err.message);
    return null;
  }
}

function getGitHubSession(req, expectedOwnerUserId = null) {
  try {
    const cookieSession = req && req.cookies ? decryptSession(req.cookies[GITHUB_COOKIE]) : null;
    if (cookieSession && cookieSession.connected) {
      // Marker cookies never contain the access token. The token must be loaded
      // from the server-side session file below.
      const sessionId = getSessionId(req);
      if (!sessionId) return { connected: false, username: null, accessToken: null };
      const file = sessionPath(sessionId);
      if (!fs.existsSync(file)) return { connected: false, username: null, accessToken: null };
    }
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
      if (expectedOwnerUserId && parsed.ownerUserId !== expectedOwnerUserId) {
        return { connected: false, username: null, accessToken: null };
      }
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
    clearGitHubCookie(req.res);
    // Keep the Brain session cookie intact so memory remains linked to the same user.
  } catch (err) {
    console.error("[GitHub Session Clear Error]:", err.message);
  }
}

module.exports = {
  saveGitHubSession,
  getGitHubSession,
  clearGitHubSession,
  getSessionId,
  ensureSessionId
};
