import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, deletionCookie, readChallenge, verifiedIdentity } from '@/lib/account-deletion';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const challenge = readChallenge(request.cookies.get(deletionCookie)?.value);
  if (!challenge) return NextResponse.json({ error: 'Please verify your sign-in again.' }, { status: 403 });
  const identity = await verifiedIdentity();
  if (!identity || identity.user.id !== challenge.userId ||
    typeof identity.claims.session_id !== 'string' ||
    identity.claims.session_id === challenge.sessionId ||
    typeof identity.claims.iat !== 'number' ||
    identity.claims.iat * 1000 < challenge.issuedAt - 1000) {
    return NextResponse.json({ error: 'Please verify the same account again.' }, { status: 403 });
  }
  try {
    const { data, error } = await adminSupabase().rpc('schedule_account_deletion', { p_owner: identity.user.id });
    if (error) throw error;
    const response = NextResponse.json(data);
    response.cookies.delete(deletionCookie);
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to schedule account deletion. Please try again.' }, { status: 500 });
  }
}
