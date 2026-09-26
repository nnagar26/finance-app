import { redirect } from 'next/navigation';
import { isLocalMode } from '@/lib/local-mode';
import { isConfigured, serverSupabase } from '@/lib/supabase-server';
import ResetPasswordForm from '@/components/reset-password-form';

export default async function ResetPasswordPage() {
  if (isLocalMode) redirect('/dashboard');
  if (!isConfigured) redirect('/setup');
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  return <ResetPasswordForm />;
}
