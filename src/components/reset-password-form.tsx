'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { browserSupabase } from '@/lib/supabase-browser';

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await browserSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your password. Please try again.');
      setBusy(false);
    }
  }

  return <main className="auth-page auth-login-page">
    <section className="auth-card login-card" aria-labelledby="reset-title">
      <div className="auth-brand"><div className="brand-mark" aria-hidden="true">M</div><span>MY FINANCE</span></div>
      <div className="auth-intro">
        <div className="eyebrow">ACCOUNT RECOVERY</div>
        <h1 id="reset-title">Choose a new password</h1>
        <p>Use a password of at least eight characters for your account.</p>
      </div>
      {error && <div className="error-box auth-error" role="alert">{error}</div>}
      <form className="auth-email-form" onSubmit={savePassword}>
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
        <label htmlFor="confirm-new-password">Confirm new password</label>
        <input id="confirm-new-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
        <button type="submit" className="auth-submit-button" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}<ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      <div className="auth-foot"><LockKeyhole size={15} aria-hidden="true" /><span>Only you can see your finance data.</span></div>
    </section>
  </main>;
}
