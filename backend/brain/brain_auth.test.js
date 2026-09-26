const assert = require('assert/strict');
const test = require('node:test');

const { normalizeAuthenticatedUser, requireBrainAuth } = require('./brain_auth');

test('Brain auth rejects missing, disconnected, and mock sessions', () => {
  assert.equal(normalizeAuthenticatedUser(null), null);
  assert.equal(normalizeAuthenticatedUser({ connected: false, accessToken: 'real', username: 'alice' }), null);
  assert.equal(normalizeAuthenticatedUser({ connected: true, accessToken: 'mock_token', username: 'alice' }), null);
});

test('Brain auth accepts only safe GitHub usernames', () => {
  assert.deepEqual(
    normalizeAuthenticatedUser({ connected: true, accessToken: 'real', username: 'alice_01' }),
    { type: 'user', userId: 'alice_01' }
  );
  assert.equal(
    normalizeAuthenticatedUser({ connected: true, accessToken: 'real', username: '../alice' }),
    null
  );
  assert.equal(
    normalizeAuthenticatedUser({ connected: true, accessToken: 'real', username: 'alice/bob' }),
    null
  );
});

test('Brain auth middleware attaches only the normalized user scope', () => {
  let nextCalled = false;
  const req = {};
  const res = {
    setHeader() {},
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  requireBrainAuth(() => ({
    connected: true,
    accessToken: 'real',
    username: 'alice'
  }))(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.brainUser, { type: 'user', userId: 'alice' });
});

test('Brain auth middleware blocks invalid sessions with 401', () => {
  const req = {};
  const res = {
    setHeader() {},
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  let nextCalled = false;

  requireBrainAuth(() => ({
    connected: true,
    accessToken: 'mock_token',
    username: 'alice'
  }))(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.code, 401);
});
