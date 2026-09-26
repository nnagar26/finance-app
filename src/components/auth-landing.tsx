'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { browserSupabase } from '@/lib/supabase-browser';

export default function AuthLanding() {
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    try {
      const db = browserSupabase();
      // Let the browser client finish restoring its cookie-backed session.
      db.auth.getUser().then(({ data }) => {
        if (!active) return;
        window.location.replace(data.user ? '/dashboard' : '/login');
      }).catch(() => {
        if (active) setError('Unable to complete sign-in. Please try again.');
      });
    } catch {
      window.location.replace('/setup');
    }
    return () => { active = false; };
  }, []);

  return <main className="auth-page"><div className="auth-card">
    <div className="brand-mark">M</div>
    <h1>{error ? 'Sign-in unavailable' : 'Opening your finances…'}</h1>
    <p>{error || 'Checking your private session.'}</p>
    {error && <Link className="button primary" href="/login">Try signing in again</Link>}
  </div></main>;
}
