const crypto = require("crypto");
const axios = require("axios");

const AUTH_COOKIE = "axmchat_auth";
const STATE_COOKIE = "axmchat_google_state";
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

function secret() {
  return process.env.AUTH_SESSION_SECRET || process.env.GITHUB_SESSION_SECRET || process.env.GITHUB_CLIENT_SECRET || "change-me-axmchat-auth";
}

function encrypt(data) {
  const key = crypto.createHash("sha256").update(secret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function decrypt(value) {
  try {
    const raw = Buffer.from(String(value || ""), "base64url");
    if (raw.length < 28) return null;
    const key = crypto.createHash("sha256").update(secret()).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch (_) {
    return null;
  }
}

function cookieOptions(maxAge = TTL_MS) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge };
}

function setAuth(res, data) {
  res.cookie(AUTH_COOKIE, encrypt({ ...data, updatedAt: new Date().toISOString() }), cookieOptions());
}

function getAuth(req) {
  const value = req?.cookies?.[AUTH_COOKIE];
  const session = decrypt(value);
  if (!session || !session.type || !session.userId) return null;
  const updatedAt = Date.parse(session.updatedAt || "");
  if (!updatedAt || Date.now() - updatedAt > TTL_MS) return null;
  return session;
}

function clearAuth(res) {
  res.clearCookie(AUTH_COOKIE, cookieOptions(0));
}

function ensureGuest(req, res) {
  const existing = getAuth(req);
  if (existing) return existing;
  const guest = {
    type: "guest",
    userId: "guest_" + crypto.randomBytes(16).toString("hex"),
    name: "Guest"
  };
  setAuth(res, guest);
  return guest;
}

function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL);
}

function googleState(res) {
  const state = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", secret()).update(state).digest("hex");
  res.cookie(STATE_COOKIE, state + "." + signature, cookieOptions(10 * 60 * 1000));
  return state;
}

function verifyState(req) {
  const raw = req?.cookies?.[STATE_COOKIE] || "";
  const [state, signature] = raw.split(".");
  if (!state || !signature) return false;
  const expected = crypto.createHmac("sha256", secret()).update(state).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function clearState(res) {
  res.clearCookie(STATE_COOKIE, cookieOptions(0));
}

function getBrainIdentity(req, res) {
  const auth = getAuth(req) || ensureGuest(req, res);
  return { type: "user", userId: auth.userId };
}

module.exports = {
  AUTH_COOKIE,
  TTL_MS,
  googleConfigured,
  googleState,
  verifyState,
  clearState,
  setAuth,
  getAuth,
  clearAuth,
  ensureGuest,
  getBrainIdentity
};
