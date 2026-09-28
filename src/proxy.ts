import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isLocalMode } from '@/lib/local-mode';

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const isDev = process.env.NODE_ENV === 'development';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseOrigin = '';
  try {
    if (supabaseUrl) supabaseOrigin = new URL(supabaseUrl).origin;
  } catch {
    // Leave the external connection source out when the configured URL is invalid.
  }
  const connectSources = ["'self'", supabaseOrigin, supabaseOrigin.replace(/^https:/, 'wss:')]
    .filter(Boolean).join(' ');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    ...(!isDev ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const nextResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
  if (isLocalMode) {
    const response = nextResponse();
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const response = nextResponse();
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }
  let response = nextResponse();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(values: { name: string; value: string; options: CookieOptions }[]) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
