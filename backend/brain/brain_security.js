const { checkRateLimit } = require("../security/rate_limiter");

const WINDOW_MS = 60 * 1000;
const MAX_HISTORY_READS = 60;
const MAX_HISTORY_RESTORES = 10;

function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : (req.ip || "unknown");
  return ip || "unknown";
}

function rateLimitBrain(kind = "read") {
  const limit = kind === "restore" || kind === "delete" ? MAX_HISTORY_RESTORES : MAX_HISTORY_READS;

  return async (req, res, next) => {
    try {
      const result = await checkRateLimit(
        `brain:${kind}:${getClientKey(req)}`,
        limit,
        WINDOW_MS
      );

      if (result.limited) {
        res.setHeader("Retry-After", String(result.retryAfter));
        return res.status(429).json({
          status: "error",
          message: "Terlalu banyak permintaan Brain. Cuba lagi sebentar."
        });
      }

      return next();
    } catch (error) {
      console.error("[Brain Rate Limit Error]:", error.message);
      return res.status(503).json({
        status: "error",
        message: "Sistem keselamatan Brain tidak tersedia. Cuba lagi."
      });
    }
  };
}

function brainNoStore(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return next();
}

function validateMemoryIdInput(memoryId) {
  return typeof memoryId === "string" &&
    memoryId.trim().length > 0 &&
    memoryId.trim().length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(memoryId.trim());
}

function validateVersionInput(version) {
  const num = Number(version);
  return Number.isInteger(num) && num > 0 && num <= 1000000;
}

module.exports = {
  rateLimitBrain,
  brainNoStore,
  validateMemoryIdInput,
  validateVersionInput
};
