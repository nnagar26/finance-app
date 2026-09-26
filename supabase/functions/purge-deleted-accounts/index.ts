import { createClient } from 'npm:@supabase/supabase-js@2.117.1';

// Deploy with JWT verification disabled. This endpoint accepts only the cron secret.
Deno.serve(async request => {
  const expected = Deno.env.get('ACCOUNT_DELETION_CRON_SECRET');
  if (request.method !== 'POST' || !expected ||
    request.headers.get('x-cron-secret') !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response('Missing service configuration', { status: 503 });
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await db.rpc('claim_due_account_deletions', { p_limit: 50 });
  if (error) return new Response('Unable to claim due accounts', { status: 500 });
  let failed = 0;
  for (const row of data ?? []) {
    const result = await db.auth.admin.deleteUser(row.owner_id);
    if (result.error) failed += 1;
  }
  return Response.json({ claimed: data?.length ?? 0, failed }, { status: failed ? 500 : 200 });
});
