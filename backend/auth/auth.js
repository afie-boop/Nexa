
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const scryptAsync = promisify(crypto.scrypt);

const AUTH_COOKIE = "axmchat_auth";
const TTL_MS = 1000 * 60 * 60 * 24 * 30;\nconst LOGIN_WINDOW_MS = 10 * 60 * 1000;\nconst MAX_LOGIN_ATTEMPTS = 8;\nconst loginAttempts = new Map();
const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
let pgPool = null;
let storeReady = false;

function secret() {
  const value = process.env.AUTH_SESSION_SECRET || process.env.GITHUB_SESSION_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET mesti ditetapkan dalam production.");
  }
  return value || "dev-only-change-me-axmchat-auth";
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
  } catch (_) { return null; }
}
function cookieOptions(maxAge = TTL_MS) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge };
}
function setAuth(res, data) {
  res.cookie(AUTH_COOKIE, encrypt({ ...data, updatedAt: new Date().toISOString() }), cookieOptions());
}
function getAuth(req) {
  const session = decrypt(req?.cookies?.[AUTH_COOKIE]);
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
  const guest = { type: "guest", userId: "guest_" + crypto.randomBytes(16).toString("hex"), name: "Guest" };
  setAuth(res, guest);
  return guest;
}
function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}
async function initUserStore() {
  if (storeReady) return;
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
    await pgPool.query(
      "CREATE TABLE IF NOT EXISTS axmchat_users (" +
      "id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, " +
      "password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
  } else {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");
  }
  storeReady = true;
}
async function readLocalUsers() {
  await initUserStore();
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}
async function writeLocalUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), "utf8");
  fs.renameSync(tmp, USERS_FILE);
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return "scrypt:" + salt + ":" + derived.toString("hex");
}
async function verifyPassword(password, encoded) {
  try {
    const [scheme, salt, hex] = String(encoded || "").split(":");
    if (scheme !== "scrypt" || !salt || !hex) return false;
    const derived = await scryptAsync(password, salt, 64);
    const expected = Buffer.from(hex, "hex");
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch (_) { return false; }
}
async function registerUser(username, password) {
  const clean = String(username || "").trim();
  const key = normalizeUsername(clean);
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(clean)) {
    return { ok: false, status: 400, message: "Username mesti 3-32 aksara dan hanya boleh mengandungi huruf, nombor, titik, garis bawah atau sengkang." };
  }
  if (String(password || "").length < 8) {
    return { ok: false, status: 400, message: "Password mesti sekurang-kurangnya 8 aksara." };
  }
  const id = "usr_" + crypto.randomBytes(12).toString("hex");
  const passwordHash = await hashPassword(password);
  await initUserStore();
  if (pgPool) {
    const exists = await pgPool.query("SELECT id FROM axmchat_users WHERE username_key = $1 LIMIT 1", [key]);
    if (exists.rowCount) return { ok: false, status: 409, message: "Username sudah digunakan." };
    await pgPool.query("INSERT INTO axmchat_users (id, username, username_key, password_hash) VALUES ($1,$2,$3,$4)", [id, clean, key, passwordHash]);
  } else {
    const users = await readLocalUsers();
    if (users.some(user => user.usernameKey === key)) return { ok: false, status: 409, message: "Username sudah digunakan." };
    users.push({ id, username: clean, usernameKey: key, passwordHash, createdAt: new Date().toISOString() });
    await writeLocalUsers(users);
  }
  return { ok: true, user: { id, username: clean, name: clean, isGuest: false } };
}
function loginRateLimited(key) {
  const now = Date.now();
  const bucket = loginAttempts.get(key);
  if (!bucket || now - bucket.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_LOGIN_ATTEMPTS;
}

async function authenticateUser(username, password, rateKey = "global") {
  if (loginRateLimited(String(rateKey))) {
    return { ok: false, status: 429, message: "Terlalu banyak cubaan log masuk. Cuba lagi dalam beberapa minit." };
  }
  const key = normalizeUsername(username);
  if (!key || !password) return { ok: false, status: 401, message: "Username atau password tidak sah." };
  await initUserStore();
  let user = null;
  if (pgPool) {
    const result = await pgPool.query("SELECT id, username, password_hash FROM axmchat_users WHERE username_key = $1 LIMIT 1", [key]);
    if (result.rows[0]) user = { id: result.rows[0].id, username: result.rows[0].username, passwordHash: result.rows[0].password_hash };
  } else {
    const users = await readLocalUsers();
    user = users.find(item => item.usernameKey === key) || null;
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, status: 401, message: "Username atau password tidak sah." };
  }
  return { ok: true, user: { id: user.id, username: user.username, name: user.username, isGuest: false } };
}
function getBrainIdentity(req, res) {
  const auth = getAuth(req) || ensureGuest(req, res);
  return { type: "user", userId: auth.userId };
}
module.exports = { AUTH_COOKIE, TTL_MS, setAuth, getAuth, clearAuth, ensureGuest, getBrainIdentity, registerUser, authenticateUser };
