const { Pool } = require("pg");

const DATABASE_URL = process.env.AXMCHAT_DATABASE_URL || process.env.DATABASE_URL || "";

/**
 * Prefer AXMCHAT_DATABASE_URL. DATABASE_URL remains as a backwards-compatible
 * fallback so existing Render deployments keep working during the rename.
 */
function resolveDatabaseUrl(raw = DATABASE_URL) {
  if (!raw) return raw;
  const url = new URL(raw);
  const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (direct) {
    const projectRef = direct[1];
    const region = process.env.SUPABASE_DB_REGION || "ap-southeast-1";
    url.hostname = `aws-0-${region}.pooler.supabase.com`;
    url.port = "5432";
    if (url.username === "postgres") url.username = `postgres.${projectRef}`;
  }
  return url.toString();
}

function createDatabasePool(options = {}) {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || options.max || 5),
    idleTimeoutMillis: options.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: options.connectionTimeoutMillis || 10000
  });
}

module.exports = { resolveDatabaseUrl, createDatabasePool };
