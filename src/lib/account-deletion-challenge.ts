import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const fiveMinutes = 5 * 60 * 1000;
export type Challenge = { userId: string; sessionId: string; issuedAt: number; nonce: string };

function signature(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function makeChallenge(userId: string, sessionId: string, secret: string, issuedAt = Date.now()) {
  const value = Buffer.from(JSON.stringify({
    userId, sessionId, issuedAt, nonce: randomBytes(16).toString('hex'),
  } satisfies Challenge)).toString('base64url');
  return `${value}.${signature(value, secret)}`;
}

export function readChallenge(cookie: string | undefined, secret: string, now = Date.now()): Challenge | null {
  if (!cookie) return null;
  const [value, mac] = cookie.split('.');
  if (!value || !mac) return null;
  const expected = Buffer.from(signature(value, secret));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const challenge = JSON.parse(Buffer.from(value, 'base64url').toString()) as Challenge;
    if (!challenge.userId || !challenge.sessionId || !challenge.nonce ||
      !Number.isFinite(challenge.issuedAt) || now - challenge.issuedAt > fiveMinutes ||
      challenge.issuedAt > now) return null;
    return challenge;
  } catch { return null; }
}
