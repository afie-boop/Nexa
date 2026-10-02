function normalizeAuthenticatedUser(session) {
  if (!session || !session.type || !session.userId) return null;
  const userId = String(session.userId).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) return null;
  return { type: "user", userId };
}

function requireBrainAuth(getSession) {
  return (req, res, next) => {
    const session = getSession(req);
    const userScope = normalizeAuthenticatedUser(session);

    if (!userScope) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({
        status: 'error',
        message: 'Brain memerlukan akaun AXMchat yang aktif.'
      });
    }

    req.brainUser = userScope;
    return next();
  };
}

module.exports = {
  normalizeAuthenticatedUser,
  requireBrainAuth
};
