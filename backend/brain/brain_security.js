const WINDOW_MS = 60 * 1000;
const MAX_HISTORY_READS = 60;
const MAX_HISTORY_RESTORES = 10;

const buckets = new Map();

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : (req.ip || 'unknown');
  return ip || 'unknown';
}

function rateLimitBrain(kind = 'read') {
  const limit = kind === 'restore' ? MAX_HISTORY_RESTORES : MAX_HISTORY_READS;

  return (req, res, next) => {
    const now = Date.now();
    const key = `${kind}:${getClientKey(req)}`;
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
      bucket = { startedAt: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        status: 'error',
        message: 'Terlalu banyak permintaan Brain. Cuba lagi sebentar.'
      });
    }

    return next();
  };
}

function brainNoStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return next();
}

function validateMemoryIdInput(memoryId) {
  return typeof memoryId === 'string' &&
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
