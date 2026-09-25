/** The file-backed ledger is deliberately available only to the local dev server. */
export const isLocalMode = process.env.NODE_ENV === 'development' &&
  (process.env.FINANCE_LOCAL_MODE === '1' ||
    (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
