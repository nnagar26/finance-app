create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.seed_finance_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;

  insert into public.categories (owner_id, name, kind)
  values
    (new.id, 'Housing/Rent', 'expense'),
    (new.id, 'Groceries', 'expense'),
    (new.id, 'Dining', 'expense'),
    (new.id, 'Transportation', 'expense'),
    (new.id, 'Gas/Fuel', 'expense'),
    (new.id, 'Utilities', 'expense'),
    (new.id, 'Internet', 'expense'),
    (new.id, 'Insurance', 'expense'),
    (new.id, 'Healthcare', 'expense'),
    (new.id, 'Shopping', 'expense'),
    (new.id, 'Entertainment', 'expense'),
    (new.id, 'Subscriptions', 'expense'),
    (new.id, 'Travel', 'expense'),
    (new.id, 'Personal Care', 'expense'),
    (new.id, 'Banking Fees', 'expense'),
    (new.id, 'Miscellaneous', 'expense'),
    (new.id, 'Salary', 'income'),
    (new.id, 'Business Income', 'income'),
    (new.id, 'Interest', 'income'),
    (new.id, 'Other Income', 'income')
  on conflict (owner_id, name) do nothing;

  insert into public.accounts (owner_id, name, kind)
  values
    (new.id, 'Checking Account', 'bank'),
    (new.id, 'Savings Account', 'bank'),
    (new.id, 'Cash', 'cash'),
    (new.id, 'Credit Card', 'card'),
    (new.id, 'Loan Account', 'other')
  on conflict (owner_id, name) do nothing;

  insert into public.payment_methods (owner_id, name)
  values
    (new.id, 'Debit Card'),
    (new.id, 'Credit Card'),
    (new.id, 'Cash'),
    (new.id, 'Bank Transfer'),
    (new.id, 'Direct Deposit'),
    (new.id, 'Automatic Payment'),
    (new.id, 'Other')
  on conflict (owner_id, name) do nothing;

  return new;
end;
$$;

revoke all on function private.seed_finance_owner() from public, anon, authenticated;

drop trigger if exists on_finance_user_created on auth.users;
create trigger on_finance_user_created
  after insert on auth.users
  for each row execute function private.seed_finance_owner();

drop function if exists public.seed_finance_owner();
