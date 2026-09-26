function normalizeAuthenticatedUser(session) {
  if (!session || !session.connected || !session.accessToken || session.accessToken === 'mock_token') {
    return null;
  }

  const username =
    session.username ||
    (session.user && session.user.login) ||
    null;

  if (typeof username !== 'string' || !username.trim()) {
    return null;
  }

  const clean = username.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
    return null;
  }

  return {
    type: 'user',
    userId: clean
  };
}

function requireBrainAuth(getSession) {
  return (req, res, next) => {
    const session = getSession(req);
    const userScope = normalizeAuthenticatedUser(session);

    if (!userScope) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({
        status: 'error',
        message: 'Brain memerlukan akaun GitHub yang disambungkan.'
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
