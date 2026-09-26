import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChallenge, readChallenge } from '../src/lib/account-deletion-challenge.ts';

const secret = 'a-test-secret-at-least-thirty-two-characters';

test('fresh sign-in challenge is bound to one user and original session', () => {
  const started = 1_000_000;
  const cookie = makeChallenge('user-a', 'original-session', secret, started);
  const challenge = readChallenge(cookie, secret, started + 1000);
  assert.equal(challenge?.userId, 'user-a');
  assert.equal(challenge?.sessionId, 'original-session');
  assert.equal(challenge?.issuedAt, started);
  assert.notEqual(makeChallenge('user-a', 'original-session', secret, started), cookie);
});

test('modified, expired, future, and wrong-secret challenges fail', () => {
  const started = 1_000_000;
  const cookie = makeChallenge('user-a', 'session-a', secret, started);
  const [value, mac] = cookie.split('.');
  assert.equal(readChallenge(`${value}.${mac.slice(0, -1)}x`, secret, started), null);
  assert.equal(readChallenge(cookie, 'different-test-secret-at-least-thirty-two-characters', started), null);
  assert.equal(readChallenge(cookie, secret, started + 5 * 60 * 1000 + 1), null);
  assert.equal(readChallenge(cookie, secret, started - 1), null);
});
