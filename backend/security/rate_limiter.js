const { Pool } = require("pg");

let pool = null;
let schemaPromise = null;
const memoryBuckets = new Map();
const MEMORY_MAX_KEYS = 5000;
let memoryCalls = 0;

function dbEnabled() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!dbEnabled()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!dbEnabled()) return false;
  if (!schemaPromise) {
    schemaPromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS axmchat_rate_limits (
        bucket_key TEXT PRIMARY KEY,
        window_started BIGINT NOT NULL,
        count INTEGER NOT NULL
      )
    `).then(() => true).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function memoryCheck(key, limit, windowMs) {
  const now = Date.now();
  memoryCalls += 1;
  if (memoryCalls % 100 === 0) {
    for (const [bucketKey, bucket] of memoryBuckets) {
      if (now - bucket.startedAt >= windowMs) memoryBuckets.delete(bucketKey);
    }
  }

  let bucket = memoryBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    if (!bucket && memoryBuckets.size >= MEMORY_MAX_KEYS) {
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [candidateKey, candidate] of memoryBuckets) {
        if (candidate.startedAt < oldestTime) {
          oldestTime = candidate.startedAt;
          oldestKey = candidateKey;
        }
      }
      if (oldestKey) memoryBuckets.delete(oldestKey);
    }
    bucket = { startedAt: now, count: 0 };
    memoryBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    limited: bucket.count > limit,
    retryAfter: Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000))
  };
}

async function checkRateLimit(key, limit, windowMs) {
  if (!dbEnabled()) return memoryCheck(key, limit, windowMs);

  const now = Date.now();
  try {
    await ensureSchema();
    const result = await getPool().query(`
      INSERT INTO axmchat_rate_limits (bucket_key, window_started, count)
      VALUES ($1, $2, 1)
      ON CONFLICT (bucket_key) DO UPDATE SET
        window_started = CASE
          WHEN axmchat_rate_limits.window_started <= $2 - $3 THEN $2
          ELSE axmchat_rate_limits.window_started
        END,
        count = CASE
          WHEN axmchat_rate_limits.window_started <= $2 - $3 THEN 1
          ELSE axmchat_rate_limits.count + 1
        END
      RETURNING window_started, count
    `, [key, now, windowMs]);

    const row = result.rows[0];
    const startedAt = Number(row.window_started);
    const count = Number(row.count);
    return {
      limited: count > limit,
      retryAfter: Math.max(1, Math.ceil((windowMs - (now - startedAt)) / 1000))
    };
  } catch (error) {
    console.warn("[RateLimit Warning]: persistent limiter unavailable; using bounded local fallback.", error.message);
    return memoryCheck(key, limit, windowMs);
  }
}

module.exports = { checkRateLimit };
