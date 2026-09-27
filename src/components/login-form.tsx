'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import Image from 'next/image';
import { browserSupabase } from '@/lib/supabase-browser';
import styles from './login-form.module.css';

type AuthMode = 'login' | 'signup' | 'reset';

export default function LoginForm({ authError = false }: { authError?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(authError ? 'The sign-in link could not be completed. Please try again.' : '');
  const [notice, setNotice] = useState('');

  function changeMode(next: AuthMode) {
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (mode === 'signup' && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const db = browserSupabase();
      const address = email.trim();
      if (mode === 'reset') {
        const { error: resetError } = await db.auth.resetPasswordForEmail(address, {
          redirectTo: `${window.location.origin}/auth/recovery`,
        });
        if (resetError) throw resetError;
        setNotice('If an account exists for this email, a password reset link is on its way.');
      } else if (mode === 'signup') {
        const { data, error: signupError } = await db.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (signupError) throw signupError;
        if (data.session) {
          router.replace('/dashboard');
          router.refresh();
          return;
        }
        setNotice('Check your email for a confirmation link, then return here to log in.');
      } else {
        const { error: loginError } = await db.auth.signInWithPassword({ email: address, password });
        if (loginError) throw loginError;
        router.replace('/dashboard');
        router.refresh();
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: signInError } = await browserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signInError) throw signInError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect to Google. Please try again.');
      setBusy(false);
    }
  }

  return <main className={`auth-page auth-login-page ${styles.page}`}>
    <section className={styles.introduction} aria-labelledby="finance-intro-title">
      <div className={styles.introCopy}>
        <span className={styles.kicker}>A clearer view of your money</span>
        <h2 id="finance-intro-title">Know where your money goes.</h2>
        <p>Track income and expenses, see monthly trends, and keep your finances in one private place.</p>
        <p className={styles.howItWorks}><strong>How it works</strong> Add a transaction and My Finance brings it into your dashboard and reports.</p>
      </div>
      <div className={styles.illustration}>
        <Image src="/images/finance-intro.jpg" alt="" fill priority sizes="(max-width: 760px) 100vw, 55vw" className={styles.image} />
        <span className={styles.imageTitle}>My Finance App</span>
      </div>
    </section>
    <section className="auth-card login-card" aria-labelledby="auth-title">
      <div className="auth-brand"><div className="brand-mark" aria-hidden="true">M</div><span>MY FINANCE</span></div>
      <div className="auth-tabs" role="group" aria-label="Account access">
        <button type="button" aria-pressed={mode === 'login' || mode === 'reset'} className={mode === 'login' || mode === 'reset' ? 'active' : ''} onClick={() => changeMode('login')}>Log in</button>
        <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>Sign up</button>
      </div>
      <div className="auth-intro">
        <div className="eyebrow">YOUR MONEY, IN FOCUS</div>
        <h1 id="auth-title">{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1>
        <p>{mode === 'signup' ? 'Start a private financial workspace of your own.' : mode === 'reset' ? 'We will email you a link to choose a new password.' : 'Log in to see your private financial workspace.'}</p>
      </div>
      {error && <div className="error-box auth-error" role="alert">{error}</div>}
      {notice && <div className="auth-notice" role="status">{notice}</div>}
      <form className="auth-email-form" onSubmit={submitEmail}>
        <label htmlFor="auth-email">Email address</label>
        <input id="auth-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required disabled={busy} />
        {mode !== 'reset' && <>
          <div className="auth-label-row"><label htmlFor="auth-password">Password</label>{mode === 'login' && <button type="button" className="auth-text-button" onClick={() => changeMode('reset')} disabled={busy}>Forgot password?</button>}</div>
          <input id="auth-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required disabled={busy} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'} />
        </>}
        {mode === 'signup' && <><label htmlFor="auth-confirm-password">Confirm password</label><input id="auth-confirm-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required disabled={busy} placeholder="Repeat your password" /></>}
        <button type="submit" className="auth-submit-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Log in with email'}<ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      {mode === 'reset' ? <button type="button" className="auth-back-button" onClick={() => changeMode('login')}>Back to log in</button> : <>
        <div className="auth-divider"><span>or</span></div>
        <button type="button" className="auth-google-button" disabled={busy} onClick={continueWithGoogle}>Continue with Google</button>
        <p className="auth-hint">{mode === 'login' ? 'Your ledger is saved securely to your account.' : 'Your new account gets its own empty ledger.'}</p>
      </>}
      <div className="auth-foot"><LockKeyhole size={15} aria-hidden="true" /><span>Only you can see your finance data.</span></div>
    </section>
  </main>;
}
