import { NextResponse, type NextRequest } from 'next/server';
import { isConfigured, serverSupabase } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const redirect = new URL('/login?error=oauth', request.url);
  const code = request.nextUrl.searchParams.get('code');
  if (!code || !isConfigured) return NextResponse.redirect(redirect);

  try {
    const db = await serverSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch {
    return NextResponse.redirect(redirect);
  }
}
