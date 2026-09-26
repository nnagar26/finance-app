import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifiedIdentity } from '@/lib/account-deletion';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const identity = await verifiedIdentity();
  if (!identity) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const parsed = z.object({ choice: z.enum(['restore', 'fresh']) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid choice.' }, { status: 400 });
  const rpc = parsed.data.choice === 'restore' ? 'restore_account' : 'start_fresh_account';
  const { error } = await identity.db.rpc(rpc);
  if (error) return NextResponse.json({ error: 'Recovery is unavailable or the deadline has passed.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
