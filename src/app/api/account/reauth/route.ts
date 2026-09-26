import { NextRequest, NextResponse } from 'next/server';
import { accountStatus, deletionCookie, makeChallenge, verifiedIdentity } from '@/lib/account-deletion';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const identity = await verifiedIdentity();
  if (!identity) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (await accountStatus()) return NextResponse.json({ error: 'Account deletion is already pending.' }, { status: 409 });
  const sessionId = identity.claims.session_id;
  if (typeof sessionId !== 'string') return NextResponse.json({ error: 'A new sign-in is required.' }, { status: 403 });
  try {
    const challenge = makeChallenge(identity.user.id, sessionId);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(deletionCookie, challenge, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 300,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unavailable.' }, { status: 503 });
  }
}
