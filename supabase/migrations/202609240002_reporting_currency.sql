-- Preserve entered amounts and use user_settings.currency_code only as the reporting currency.
drop trigger if exists transaction_currency on public.transactions;
drop trigger if exists recurring_currency on public.recurring_rules;

update public.transactions
set type = 'income'::public.transaction_type, other_effect = null
where type in ('salary'::public.transaction_type, 'refund'::public.transaction_type);

update public.transactions
set type = 'other'::public.transaction_type, other_effect = 'neutral'::public.financial_effect
where type = 'transfer'::public.transaction_type;

update public.recurring_rules
set type = 'income'::public.transaction_type, other_effect = null
where type in ('salary'::public.transaction_type, 'refund'::public.transaction_type);

update public.recurring_rules
set type = 'other'::public.transaction_type, other_effect = 'neutral'::public.financial_effect
where type = 'transfer'::public.transaction_type;

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  base_currency text not null check (base_currency in ('CAD','USD','EUR','GBP','AUD')),
  quote_currency text not null check (quote_currency in ('CAD','USD','EUR','GBP','AUD')),
  requested_date date not null,
  effective_date date not null,
  rate numeric(24,12) not null check (rate > 0),
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (owner_id, base_currency, quote_currency, requested_date)
);

alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon;
grant select, insert, update on public.exchange_rates to authenticated;
create policy owner_only on public.exchange_rates for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant update (currency_code, theme, time_zone) on public.user_settings to authenticated;
revoke execute on function public.convert_ledger(text,numeric) from authenticated;
