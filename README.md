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

## Set up private hosted sync

1. Run `npm install`.
2. Create a Supabase project. Run the SQL files in `supabase/migrations` in filename order **before inviting the owner**. The migrations create the tables, access policies, reporting-currency support, and default categories/methods when the owner is created.
3. In Supabase Auth, invite your email address. Under Auth settings, disable **Allow new users to sign up** and anonymous sign-ins. The app uses Supabase's default magic-link email, so no custom SMTP or email-template editing is needed. Set the Auth Site URL to `http://localhost:3000` for local use.
4. Copy `.env.example` to `.env.local` and enter the project URL and publishable key. Never put a service-role key in `NEXT_PUBLIC_` variables.
5. Run `npm run dev` and open `http://127.0.0.1:3000`.

For deployment, import this repository into Vercel, add the same two environment variables, and deploy. Add the production URL to Supabase Auth redirect URLs. Keep the Supabase project private and use its dashboard to manage backups.

## Data rules

- Amounts are positive integer minor units. Supported currencies (CAD, USD, EUR, GBP, AUD) all use two decimal places.
- Expense increases expenses. Income and income-like Other increase income. Neutral Other does not affect totals. Salary uses an Income category; refunds are entered as Income.
- Net savings = income − expenses.
- Every transaction retains its entered amount and currency. The top-bar reporting currency converts views with a cached reference rate from the transaction date. A missing uncached rate requires an internet connection; original values are never rewritten.
- Accounts/cards label transactions; balances are not tracked.
- Recurring rules create no transaction until the owner chooses **Post**. **Skip** advances the due date without changing totals.
- Reporting-currency conversion uses cached historical reference rates from Frankfurter. Original transaction amounts are preserved, including when the reporting currency changes.

## Checks

Run `npm run privacy:check`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

The database access policies and RPCs require a configured Supabase project for an integration test. After setup, sign in as the invited owner and verify a second signed-in account cannot read the owner's rows. Also verify that public sign-up remains disabled.
