-- A missing lifecycle row means an active account (including existing users).
create table private.account_deletions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  purge_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'purging')),
  claimed_at timestamptz
);
create index account_deletions_due on private.account_deletions (purge_at) where state = 'pending';
revoke all on private.account_deletions from public, anon, authenticated;

create or replace function public.account_is_active()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and not exists (
    select 1 from private.account_deletions where owner_id = auth.uid()
  );
$$;
revoke all on function public.account_is_active() from public, anon;
grant execute on function public.account_is_active() to authenticated;

create or replace function public.account_deletion_status()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare deletion private.account_deletions%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into deletion from private.account_deletions where owner_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object(
    'requested_at', deletion.requested_at,
    'purge_at', deletion.purge_at,
    'state', deletion.state,
    'recoverable', deletion.state = 'pending' and deletion.purge_at > now()
  );
end;
$$;
revoke all on function public.account_deletion_status() from public, anon;
grant execute on function public.account_deletion_status() to authenticated;

create or replace function public.schedule_account_deletion(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare deletion private.account_deletions%rowtype;
begin
  insert into private.account_deletions (owner_id, purge_at)
  values (p_owner, now() + interval '30 days')
  on conflict (owner_id) do nothing;
  select * into deletion from private.account_deletions where owner_id = p_owner;
  return jsonb_build_object('requested_at', deletion.requested_at, 'purge_at', deletion.purge_at);
end;
$$;
revoke all on function public.schedule_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.schedule_account_deletion(uuid) to service_role;

create or replace function public.restore_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare deletion private.account_deletions%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into deletion from private.account_deletions where owner_id = auth.uid() for update;
  if not found or deletion.state <> 'pending' or deletion.purge_at <= now() then
    raise exception 'Recovery is no longer available';
  end if;
  delete from private.account_deletions where owner_id = auth.uid();
end;
$$;
revoke all on function public.restore_account() from public, anon;
grant execute on function public.restore_account() to authenticated;

create or replace function public.start_fresh_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare deletion private.account_deletions%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into deletion from private.account_deletions where owner_id = auth.uid() for update;
  if not found or deletion.state <> 'pending' or deletion.purge_at <= now() then
    raise exception 'Recovery is no longer available';
  end if;
  delete from public.transaction_tags where owner_id = auth.uid();
  delete from public.transactions where owner_id = auth.uid();
  delete from public.recurring_occurrences where owner_id = auth.uid();
  delete from public.recurring_rules where owner_id = auth.uid();
  delete from public.currency_conversion_lines where owner_id = auth.uid();
  delete from public.currency_conversion_batches where owner_id = auth.uid();
  delete from public.exchange_rates where owner_id = auth.uid();
  delete from public.tags where owner_id = auth.uid();
  delete from public.categories where owner_id = auth.uid();
  delete from public.payment_methods where owner_id = auth.uid();
  delete from public.accounts where owner_id = auth.uid();
  delete from public.user_settings where owner_id = auth.uid();
  perform private.seed_finance_owner_defaults(auth.uid());
  delete from private.account_deletions where owner_id = auth.uid();
end;
$$;
revoke all on function public.start_fresh_account() from public, anon;
grant execute on function public.start_fresh_account() to authenticated;

-- Reuse the same defaults for initial signup and Start fresh.
create or replace function private.seed_finance_owner_defaults(p_owner uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_settings (owner_id) values (p_owner);
  insert into public.categories (owner_id, name, kind) values
    (p_owner,'Housing/Rent','expense'),(p_owner,'Groceries','expense'),
    (p_owner,'Dining','expense'),(p_owner,'Transportation','expense'),
    (p_owner,'Gas/Fuel','expense'),(p_owner,'Utilities','expense'),
    (p_owner,'Internet','expense'),(p_owner,'Insurance','expense'),
    (p_owner,'Healthcare','expense'),(p_owner,'Shopping','expense'),
    (p_owner,'Entertainment','expense'),(p_owner,'Subscriptions','expense'),
    (p_owner,'Travel','expense'),(p_owner,'Personal Care','expense'),
    (p_owner,'Banking Fees','expense'),(p_owner,'Miscellaneous','expense'),
    (p_owner,'Salary','income'),(p_owner,'Business Income','income'),
    (p_owner,'Interest','income'),(p_owner,'Other Income','income');
  insert into public.accounts (owner_id, name, kind) values
    (p_owner,'Checking Account','bank'),(p_owner,'Savings Account','bank'),
    (p_owner,'Cash','cash'),(p_owner,'Credit Card','card'),
    (p_owner,'Loan Account','other');
  insert into public.payment_methods (owner_id, name) values
    (p_owner,'Debit Card'),(p_owner,'Credit Card'),(p_owner,'Cash'),
    (p_owner,'Bank Transfer'),(p_owner,'Direct Deposit'),
    (p_owner,'Automatic Payment'),(p_owner,'Other');
end;
$$;
revoke all on function private.seed_finance_owner_defaults(uuid) from public, anon, authenticated;

create or replace function private.seed_finance_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.seed_finance_owner_defaults(new.id);
  return new;
end;
$$;

-- Replace the original broad owner policies for every finance table.
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','categories','accounts','payment_methods','tags',
    'recurring_rules','recurring_occurrences','transactions','transaction_tags',
    'currency_conversion_batches','currency_conversion_lines','exchange_rates'
  ] loop
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I for all to authenticated using (owner_id = (select auth.uid()) and (select public.account_is_active())) with check (owner_id = (select auth.uid()) and (select public.account_is_active()))',
      t
    );
  end loop;
end $$;

-- A privileged server worker claims due accounts before calling the Auth admin API.
create or replace function public.claim_due_account_deletions(p_limit integer default 50)
returns table(owner_id uuid) language plpgsql security definer set search_path = ''
as $$
begin
  return query
    with due as (
      select d.owner_id from private.account_deletions d
      where d.purge_at <= now()
        and (d.state = 'pending' or (d.state = 'purging' and d.claimed_at < now() - interval '10 minutes'))
      order by d.purge_at limit least(greatest(p_limit, 1), 100)
      for update skip locked
    )
    update private.account_deletions d set state = 'purging', claimed_at = now()
    from due where d.owner_id = due.owner_id returning d.owner_id;
end;
$$;
revoke all on function public.claim_due_account_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_due_account_deletions(integer) to service_role;
