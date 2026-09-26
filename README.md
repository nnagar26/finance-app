# My Finance · Personal Finance Manager

A private, responsive finance app built with Next.js, Supabase, Tailwind CSS, and Recharts. It supports transaction entry, custom lists, monthly dashboards, reports, a spending calendar, reviewed recurring transactions, currency conversion, dark mode, and CSV export.

## Preview

The dashboard below uses fictional demo transactions. Run `npm run demo` to create the same kind of sample data locally.

![My Finance dashboard with fictional sample data](docs/dashboard-demo.jpg)

## Run on your laptop (no account needed)

1. Open this folder in VS Code and open **Terminal → New Terminal**.
2. Run `npm install` (only needed the first time).
3. Run `npm run dev:local`.
4. Open `http://127.0.0.1:3000` in your browser.

You can add and edit transactions immediately. Local data is saved in `.local-data/finance.json` in this project folder and is ignored by Git. The development server listens only on this laptop. No Supabase account or `.env.local` is needed for this mode. If a Supabase `.env.local` already exists, `npm run dev:local` still uses the local file. Stop the server with **Ctrl+C**. Back up the `.local-data` folder if you want to preserve this ledger; it does not automatically sync with Supabase.

### Optional fictional demo

On a fresh clone, run `npm run demo` before `npm run dev:local` to create an entirely fictional sample ledger. It includes current and previous-month examples for salary, rent, mortgage, groceries, utilities, dining, and a subscription, plus demo Visa, Mastercard, and Amex accounts. The dates are generated relative to the day you run the command so the dashboard remains useful.

The demo command refuses to replace an existing `.local-data/finance.json`. Your personal ledger and all local backups remain ignored by Git. To use the normal empty personal ledger, skip the demo command and run `npm run dev:local` directly.

## Set up multi-user hosted accounts

1. Run `npm install`.
2. Create a Supabase project. Run the SQL files in `supabase/migrations` in filename order. The migrations create the tables, per-user row-level security policies, reporting-currency support, and default categories/methods for every newly created account.
3. In Supabase **Authentication → Providers**, keep Email enabled with email confirmation on. To offer Google too, enable Google and create a Google Cloud OAuth web client with an external audience and the basic `openid`, email, and profile scopes. In Google Cloud, add the Supabase callback URL shown on that provider page as an authorized redirect URI; add the local and production app origins as authorized JavaScript origins. Copy the Google client ID and secret into the Supabase provider settings only.
4. In Supabase Auth settings, enable **Allow new users to sign up** and keep anonymous sign-ins disabled. Add both `/auth/callback` and `/auth/recovery` URLs for `http://127.0.0.1:3000`, `http://localhost:3000`, and the production `https://<your-vercel-domain>` to **Redirect URLs**. Set **Site URL** to the production app URL. Keep email confirmation enabled.
5. Configure **Authentication → SMTP Settings** with an email provider's SMTP host, port, username, password, and sender address. Supabase's default mail sender only delivers to project team addresses, so public email/password signup, confirmation, and password reset need custom SMTP. These credentials belong in Supabase, never in the browser or `NEXT_PUBLIC_` variables. Google OAuth alone does not require custom SMTP.
6. Copy `.env.example` to `.env.local` and enter the Supabase project URL, publishable key, server-only service-role key, and a random `ACCOUNT_DELETION_SECRET` of at least 32 characters. Never put a service-role key, deletion secret, or Google client secret in `NEXT_PUBLIC_` variables.
7. Run `npm run dev` and open `http://127.0.0.1:3000`. Choose **Sign up** to create an account with email/password or Google. Email users follow the confirmation link before logging in. **Forgot password?** sends a reset link. Every new account gets a separate private ledger.

For deployment, link this project to Vercel, add all four variables from `.env.example` to the Vercel Production environment, and deploy. The free `vercel.app` domain works without buying a custom domain. Add that exact domain's `/auth/callback` and `/auth/callback?next=delete` URLs to Supabase Redirect URLs before testing Google sign-in and deletion verification. Keep the Supabase project private and use its dashboard to manage backups.

### Account deletion and recovery

Signed-in users can schedule account deletion under **Settings → Delete your account**. They must sign in again with the same email/password or Google account, then confirm. The 30-day clock starts at that confirmation. Pending users are signed out and their finance data is blocked by both app routes and database row-level security. Signing in before the deadline opens **Account recovery**, where they may restore the ledger or erase its finance data immediately and start fresh with the same sign-in. Start fresh resets ledger settings and default lists; the sign-in identity and profile display name remain.

Set up automatic permanent deletion before offering this feature:

1. Apply `supabase/migrations/202609260003_account_deletion.sql` to the hosted Supabase project.
2. Deploy `supabase/functions/purge-deleted-accounts` with JWT verification disabled as specified by `supabase/config.toml`. Set its `ACCOUNT_DELETION_CRON_SECRET` to a long random value; Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.
3. Enable Supabase Cron (`pg_cron`) and `pg_net`. In Supabase Vault, create secrets named `account_deletion_function_url` (the deployed function URL) and `account_deletion_cron_secret` (the same value from step 2). Run `supabase/cron/account-deletion.sql` to create the hourly job. Verify its run history in Supabase Cron and the Edge Function logs.
4. Keep a documented backup retention policy. The cleanup deletes the Auth user and associated live finance rows; provider backups may remain until their retention period expires. Review the 30-day grace period against laws applicable to your users before release.

The worker claims only expired accounts, retries failed Auth deletions after ten minutes, and reports failures with an HTTP 500 response for monitoring. Recovery is disabled precisely at the deadline, even if the next hourly job has not run.

Each person can use email/password or Google sign-in to create their own private ledger. The existing local `.local-data/finance.json` ledger is not uploaded or synced. Run `npm run dev:local` to continue using it independently.

## Data rules

- Amounts are positive integer minor units. Supported currencies (CAD, USD, EUR, GBP, AUD, INR) all use two decimal places.
- Expense increases expenses. Income and income-like Other increase income. Neutral Other does not affect totals. Salary uses an Income category; refunds are entered as Income.
- Net savings = income − expenses.
- Every transaction retains its entered amount and currency. The top-bar reporting currency converts views with a cached reference rate from the transaction date. A missing uncached rate requires an internet connection; original values are never rewritten.
- Accounts/cards label transactions; balances are not tracked.
- Recurring rules create no transaction until the owner chooses **Post**. **Skip** advances the due date without changing totals.
- Reporting-currency conversion uses cached historical reference rates from Frankfurter. Original transaction amounts are preserved, including when the reporting currency changes.

## Checks

Run `npm run privacy:check`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

The database access policies and RPCs require a configured Supabase project for an integration test. After setup, sign in with two different accounts, add a transaction in each, and verify neither account can read or change the other's rows. Confirm both accounts receive their own settings and default categories, and that confirmation, reset, and Google sign-in return to the local and production app URLs.

For deletion, test both a new account and an existing one. Cancel during verification and final confirmation, then complete the flow with email/password and Google separately. Confirm a different signed-in user cannot complete the original user's deletion challenge. While pending, verify dashboard, mutation, CSV export, and direct Supabase table reads/writes are denied. Restore once and check the old ledger. On a separate test account, choose Start fresh and check the same sign-in opens an empty ledger with default lists and settings. Finally, use a disposable account to verify the deadline boundary, a successful hourly cleanup, and that a failed Auth deletion is retried without allowing recovery.
