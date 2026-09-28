import { redirect } from 'next/navigation';
import { isConfigured, serverSupabase } from '@/lib/supabase-server';
import LoginForm from '@/components/login-form';
import { isLocalMode } from '@/lib/local-mode';
import { accountStatus } from '@/lib/account-deletion';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isLocalMode) redirect('/dashboard');
  if (!isConfigured) redirect('/setup');
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (user) redirect((await accountStatus()) ? '/account-recovery' : '/dashboard');
  const { error } = await searchParams;
  return <LoginForm authError={error === 'oauth'} />;
}
