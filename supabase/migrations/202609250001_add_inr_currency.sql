-- Add INR to the exchange-rate allowlist for existing hosted ledgers.
alter table public.exchange_rates
  drop constraint if exists exchange_rates_base_currency_check,
  drop constraint if exists exchange_rates_quote_currency_check;

alter table public.exchange_rates
  add constraint exchange_rates_base_currency_check
    check (base_currency in ('CAD','USD','EUR','GBP','AUD','INR')),
  add constraint exchange_rates_quote_currency_check
    check (quote_currency in ('CAD','USD','EUR','GBP','AUD','INR'));
