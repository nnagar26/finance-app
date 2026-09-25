import { redirect } from 'next/navigation';
import { isConfigured, serverSupabase } from '@/lib/supabase-server';
import LoginForm from '@/components/login-form';
import { isLocalMode } from '@/lib/local-mode';

export default async function LoginPage() {
  if (isLocalMode) redirect('/dashboard');
  if (!isConfigured) redirect('/setup');
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (user) redirect('/dashboard');
  return <LoginForm />;
}
