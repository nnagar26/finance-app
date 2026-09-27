'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserSupabase } from '@/lib/supabase-browser';

type Step = 'closed' | 'verify' | 'confirm';

function estimatedDeadline() {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
}

export default function AccountDeletionPanel({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('closed');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deadline, setDeadline] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('delete') !== 'confirm') return;
    const timer = window.setTimeout(() => {
      setStep('confirm');
      setDeadline(estimatedDeadline());
      window.history.replaceState(null, '', '/settings');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function open() {
    setError('');
    setDeadline(estimatedDeadline());
    setStep('verify');
  }
  async function beginChallenge() {
    const response = await fetch('/api/account/reauth', { method: 'POST' });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error || 'Unable to verify your account.');
    }
  }
  async function verifyPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await beginChallenge();
      const { error: signInError } = await browserSupabase().auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      setPassword('');
      setStep('confirm');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify your sign-in.');
    } finally { setBusy(false); }
  }
  async function verifyGoogle() {
    setBusy(true); setError('');
    try {
      await beginChallenge();
      const { error: signInError } = await browserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=delete` },
      });
      if (signInError) throw signInError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify with Google.');
      setBusy(false);
    }
  }
  async function confirmDeletion() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/account/deletion', { method: 'POST' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Unable to schedule deletion.');
      }
      await browserSupabase().auth.signOut({ scope: 'global' });
      router.replace('/login');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to schedule deletion.');
      setBusy(false);
    }
  }
  return <><section className="panel account-danger">
    <div><h2>Delete your account</h2><p>Schedule deletion of your sign-in and finance data. You can return and choose to recover it for 30 days.</p></div>
    <button type="button" className="button secondary danger-text" onClick={open}>Delete account</button>
  </section>
  {step !== 'closed' && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setStep('closed'); }}>
    <div className="modal deletion-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
      <div className="modal-head"><div><div className="eyebrow">ACCOUNT DELETION</div><h2 id="delete-account-title">{step === 'verify' ? 'Verify your sign-in' : 'Confirm account deletion'}</h2></div></div>
      {step === 'verify' ? <><p>For your security, sign in again with the same account before deleting it.</p>
        <form onSubmit={verifyPassword} className="profile-form">
          <label className="field"><span>Password for {email}</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy}/></label>
          <button className="button primary" disabled={busy}>Verify with password</button>
        </form>
        <button type="button" className="button secondary google-verify" onClick={verifyGoogle} disabled={busy}>Verify with Google</button>
      </> : <><p>Deletion starts when you click the final button. You will be signed out and your finance data will be unavailable.</p>
        <p>You may sign in with this same account to restore your existing ledger or permanently erase it and start fresh before the deadline. If you do neither, your live account and data will be permanently deleted after 30 days.</p>
        <p><strong>Estimated deadline if confirmed now: {deadline}</strong></p>
      </>}
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="button ghost" disabled={busy} onClick={() => setStep('closed')}>Cancel</button>
        {step === 'confirm' && <button type="button" className="button secondary danger-text" disabled={busy} onClick={confirmDeletion}>{busy ? 'Scheduling…' : 'Delete account'}</button>}
      </div>
    </div>
  </div>}</>;
}
