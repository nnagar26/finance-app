'use client';

import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { browserSupabase } from '@/lib/supabase-browser';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const db = browserSupabase();
      const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) throw error;
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-card login-card">
    <div className="brand-mark">M</div><div className="eyebrow">YOUR MONEY, IN FOCUS</div>
    <h1>Welcome back.</h1><p>Sign in to your private financial workspace.</p>
    <form onSubmit={submit} className="stack gap-lg">
      <label className="field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={sent} placeholder="you@example.com" /></label>
      {sent && <div className="notice" role="status">Check your inbox for a sign-in link. Open it in this browser to continue.</div>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {!sent && <button className="button primary wide" disabled={busy}>{busy ? 'Please wait…' : 'Email me a sign-in link'} <ArrowRight size={17} /></button>}
    </form>
    {sent && <button className="text-button" onClick={() => setSent(false)}>Use another email</button>}
    <div className="auth-foot"><LockKeyhole size={15} /> Private, owner-only access</div>
  </div></main>;
}
