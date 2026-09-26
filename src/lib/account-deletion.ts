import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serverSupabase } from '@/lib/supabase-server';
import { makeChallenge as signChallenge, readChallenge as verifyChallenge } from '@/lib/account-deletion-challenge';

export const deletionCookie = 'finance-delete-reauth';
export type DeletionStatus = {
  requested_at: string;
  purge_at: string;
  state: 'pending' | 'purging';
  recoverable: boolean;
};

function secret() {
  const value = process.env.ACCOUNT_DELETION_SECRET;
  if (!value || value.length < 32) throw new Error('Account deletion is not configured.');
  return value;
}

export function makeChallenge(userId: string, sessionId: string) {
  return signChallenge(userId, sessionId, secret());
}

export function readChallenge(cookie: string | undefined) {
  return verifyChallenge(cookie, secret());
}

export async function verifiedIdentity() {
  const db = await serverSupabase();
  const [{ data: { user }, error: userError }, { data: claimsData, error: claimsError }] =
    await Promise.all([db.auth.getUser(), db.auth.getClaims()]);
  const claims = claimsData?.claims;
  if (userError || claimsError || !user || !claims || claims.sub !== user.id) return null;
  return { db, user, claims };
}

export async function accountStatus() {
  const identity = await verifiedIdentity();
  if (!identity) return null;
  const { data, error } = await identity.db.rpc('account_deletion_status');
  if (error) throw error;
  return data as DeletionStatus | null;
}

export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Account deletion is not configured.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
