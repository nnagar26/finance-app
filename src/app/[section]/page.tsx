import { notFound, redirect } from 'next/navigation';
import { isConfigured, serverSupabase } from '@/lib/supabase-server';
import FinanceApp from '@/components/finance-app';
import { isLocalMode } from '@/lib/local-mode';

const sections = ['dashboard', 'transactions', 'calendar', 'reports', 'recurring', 'settings'];
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  if (isLocalMode) return <FinanceApp section={section} email="Local laptop" localMode />;
  if (!isConfigured) redirect('/setup');
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  return <FinanceApp section={section} email={user.email ?? ''} />;
}
