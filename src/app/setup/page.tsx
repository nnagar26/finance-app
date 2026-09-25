import { isConfigured } from '@/lib/supabase-server';
import AuthLanding from '@/components/auth-landing';
import { isLocalMode } from '@/lib/local-mode';
import { redirect } from 'next/navigation';

export default function SetupPage() {
  if (isLocalMode) redirect('/dashboard');
  if (isConfigured) return <AuthLanding />;
  return <main className="auth-page"><div className="auth-card">
    <div className="brand-mark">M</div><h1>Connect your private database</h1>
    <p>This app needs a Supabase project before you can sign in and save financial data.</p>
    <ol><li>Create a Supabase project and run the SQL migration in <code>supabase/migrations</code>.</li>
      <li>Invite your email address, then disable public sign-ups in Supabase Auth.</li>
      <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in the project URL and publishable key.</li>
      <li>Restart the development server.</li></ol>
    <p className="muted">The project README contains the full setup steps.</p>
  </div></main>;
}
