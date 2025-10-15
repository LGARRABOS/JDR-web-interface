import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'unit_test_secret';

const frozenUnixTime = 1_700_000_000;
const originalNow = Date.now;
Date.now = () => frozenUnixTime * 1000;

after(() => {
  Date.now = originalNow;
  delete globalThis.__ETERNITA_JWT__;
});

globalThis.__ETERNITA_JWT__ = {
  sign: (payload, secret, options) =>
    JSON.stringify({ payload, secret, options, iat: frozenUnixTime, exp: frozenUnixTime + 7 * 24 * 60 * 60 }),
  verify: (token, secret) => {
    const parsed = JSON.parse(token);
    if (parsed.secret !== secret) {
      throw new Error('invalid signature');
    }
    return { ...parsed.payload, iat: parsed.iat, exp: parsed.exp };
  },
};

const { generateToken, verifyToken } = await import('../src/utils/jwt.js');

test('generateToken produces a verifiable JWT payload', () => {
  const payload = { userId: '12345', role: 'mj' };
  const token = generateToken(payload);
  const decoded = verifyToken(token);

  assert.equal(decoded.userId, payload.userId);
  assert.equal(decoded.role, payload.role);
  assert.equal(decoded.iat, frozenUnixTime);
  assert.equal(decoded.exp, frozenUnixTime + 7 * 24 * 60 * 60);
});

test('verifyToken throws on invalid tokens', () => {
  assert.throws(() => verifyToken('{"secret":"other"}'), /invalid signature/);
  assert.throws(() => verifyToken('not-a-valid-token'));
});
