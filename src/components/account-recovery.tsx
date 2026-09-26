'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserSupabase } from '@/lib/supabase-browser';

export default function AccountRecovery({ purgeAt, recoverable }: { purgeAt: string; recoverable: boolean }) {
  const router = useRouter();
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [beforeDeadline, setBeforeDeadline] = useState(recoverable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deadline = new Date(purgeAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short', timeZoneName: 'short' });
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() >= Date.parse(purgeAt)) setBeforeDeadline(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [purgeAt]);
  async function choose(choice: 'restore' | 'fresh') {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/account/recover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Unable to recover this account.');
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to recover this account.');
    } finally { setBusy(false); }
  }
  async function signOut() {
    await browserSupabase().auth.signOut({ scope: 'local' });
    router.replace('/login');
    router.refresh();
  }
  return <main className="auth-page"><section className="auth-card recovery-card" aria-labelledby="recovery-title">
    <div className="brand-mark">M</div>
    <div className="eyebrow">ACCOUNT RECOVERY</div>
    <h1 id="recovery-title">Your account is scheduled for deletion</h1>
    <p>Your finance data is unavailable while deletion is pending. The recovery deadline is <strong>{deadline}</strong>.</p>
    {beforeDeadline ? <><p>Restore your existing ledger, or permanently erase it now and start with an empty workspace using this same sign-in.</p>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="recovery-actions">
        <button className="button primary" disabled={busy} onClick={() => choose('restore')}>Restore account</button>
        <button className="button secondary danger-text" disabled={busy} onClick={() => setConfirmFresh(true)}>Start fresh</button>
      </div>
      {confirmFresh && <div className="confirm-box" role="group" aria-label="Confirm fresh start">
        <strong>Erase your old finance data now?</strong>
        <span>This cannot be undone. Your sign-in stays the same, but transactions, recurring items, lists, and settings return to their defaults.</span>
        <div><button className="button ghost" disabled={busy} onClick={() => setConfirmFresh(false)}>Cancel</button><button className="button secondary danger-text" disabled={busy} onClick={() => choose('fresh')}>{busy ? 'Erasing…' : 'Erase data and start fresh'}</button></div>
      </div>}</> : <p>The recovery deadline has passed. Permanent deletion is being completed; this account can no longer be restored.</p>}
    <button className="text-button" disabled={busy} onClick={signOut}>Sign out</button>
  </section></main>;
}
