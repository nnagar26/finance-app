import { redirect } from 'next/navigation';
import AuthLanding from '@/components/auth-landing';
import { isConfigured } from '@/lib/supabase-server';

export default function Home() {
  if (!isConfigured) redirect('/setup');
  return <AuthLanding />;
}
