import { redirect } from 'next/navigation';
import { accountStatus } from '@/lib/account-deletion';
import { isLocalMode } from '@/lib/local-mode';
import { serverSupabase } from '@/lib/supabase-server';
import AccountRecovery from '@/components/account-recovery';

export default async function AccountRecoveryPage() {
  if (isLocalMode) redirect('/dashboard');
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const status = await accountStatus();
  if (!status) redirect('/dashboard');
  return <AccountRecovery purgeAt={status.purge_at} recoverable={status.recoverable} />;
}
