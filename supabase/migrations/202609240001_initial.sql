create extension if not exists pgcrypto;

create type public.transaction_type as enum ('expense','income','salary','refund','transfer','other');
create type public.financial_effect as enum ('income','expense','neutral');
create type public.category_kind as enum ('income','expense','both');
create type public.account_kind as enum ('cash','bank','card','other');
create type public.recurrence_frequency as enum ('weekly','biweekly','monthly','quarterly','yearly');
create type public.occurrence_status as enum ('posted','skipped');

create table public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  currency_code text not null default 'CAD' check (currency_code ~ '^[A-Z]{3}$'),
  time_zone text not null default 'America/Toronto',
  theme text not null default 'system' check (theme in ('light','dark','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80), kind public.category_kind not null default 'expense',
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (owner_id,id), unique (owner_id,name)
);
create table public.accounts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80), kind public.account_kind not null default 'other',
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (owner_id,id), unique (owner_id,name)
);
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (owner_id,id), unique (owner_id,name)
);
create table public.tags (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40), active boolean not null default true,
  created_at timestamptz not null default now(), unique (owner_id,id), unique (owner_id,name)
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  type public.transaction_type not null, other_effect public.financial_effect,
  category_id uuid, payment_method_id uuid, account_id uuid,
  description text not null default '', frequency public.recurrence_frequency not null,
  anchor_day smallint not null check (anchor_day between 1 and 31), next_due_on date not null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (owner_id,id),
  foreign key (owner_id,category_id) references public.categories(owner_id,id),
  foreign key (owner_id,payment_method_id) references public.payment_methods(owner_id,id),
  foreign key (owner_id,account_id) references public.accounts(owner_id,id),
  check ((type = 'other' and other_effect is not null) or (type <> 'other' and other_effect is null))
);

create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null, due_on date not null, status public.occurrence_status not null,
  created_at timestamptz not null default now(),
  unique (owner_id,id), unique (rule_id,due_on),
  foreign key (owner_id,rule_id) references public.recurring_rules(owner_id,id) on delete cascade
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null, amount_minor bigint not null check (amount_minor between 1 and 1000000000000),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  type public.transaction_type not null, other_effect public.financial_effect,
  category_id uuid, payment_method_id uuid, account_id uuid,
  description text not null default '', notes text not null default '',
  recurring_occurrence_id uuid unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (owner_id,id),
  foreign key (owner_id,category_id) references public.categories(owner_id,id),
  foreign key (owner_id,payment_method_id) references public.payment_methods(owner_id,id),
  foreign key (owner_id,account_id) references public.accounts(owner_id,id),
  foreign key (owner_id,recurring_occurrence_id) references public.recurring_occurrences(owner_id,id),
  check ((type = 'other' and other_effect is not null) or (type <> 'other' and other_effect is null))
);
create index transactions_owner_date on public.transactions(owner_id,transaction_date desc,id);
create index transactions_owner_category on public.transactions(owner_id,category_id);
create index transactions_owner_method on public.transactions(owner_id,payment_method_id);
create index transactions_owner_account on public.transactions(owner_id,account_id);

create table public.transaction_tags (
  owner_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null, tag_id uuid not null,
  primary key (transaction_id,tag_id),
  foreign key (owner_id,transaction_id) references public.transactions(owner_id,id) on delete cascade,
  foreign key (owner_id,tag_id) references public.tags(owner_id,id)
);

create table public.currency_conversion_batches (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  from_currency text not null, to_currency text not null,
  rate numeric(24,12) not null check (rate > 0), created_at timestamptz not null default now(),
  unique (owner_id,id)
);
create table public.currency_conversion_lines (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null, entity_type text not null check (entity_type in ('transaction','recurring_rule')),
  entity_id uuid not null, old_amount_minor bigint not null, new_amount_minor bigint not null,
  foreign key (owner_id,batch_id) references public.currency_conversion_batches(owner_id,id) on delete cascade
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger settings_updated before update on public.user_settings for each row execute function public.set_updated_at();
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger accounts_updated before update on public.accounts for each row execute function public.set_updated_at();
create trigger methods_updated before update on public.payment_methods for each row execute function public.set_updated_at();
create trigger transactions_updated before update on public.transactions for each row execute function public.set_updated_at();
create trigger recurring_updated before update on public.recurring_rules for each row execute function public.set_updated_at();

create or replace function public.seed_finance_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings(owner_id) values (new.id);
  insert into public.categories(owner_id,name,kind) values
    (new.id,'Salary','income'),(new.id,'Other Income','income'),
    (new.id,'Groceries','expense'),(new.id,'Dining','expense'),(new.id,'Rent','expense'),
    (new.id,'Utilities','expense'),(new.id,'Mortgage','expense'),(new.id,'Gas','expense'),
    (new.id,'Car Maintenance','expense'),(new.id,'Car Insurance','expense'),(new.id,'Car loan','expense'),
    (new.id,'Internet (WiFi)','expense'),(new.id,'Phone','expense'),(new.id,'Household Supplies','expense'),
    (new.id,'Shopping','expense'),(new.id,'Entertainment','expense'),(new.id,'Travel','expense'),
    (new.id,'Subscriptions','expense'),(new.id,'Gifts','expense'),(new.id,'Banking/Fees','expense'),
    (new.id,'Home Maintenance','expense'),(new.id,'House Insurance','expense'),
    (new.id,'Transportation','expense'),(new.id,'Miscellaneous','both');
  insert into public.payment_methods(owner_id,name) values
    (new.id,'Cash'),(new.id,'Debit Card'),(new.id,'Credit Card'),(new.id,'Bank Account'),
    (new.id,'E-transfer'),(new.id,'Apple Pay'),(new.id,'Google Pay'),(new.id,'Other');
  insert into public.accounts(owner_id,name,kind) values (new.id,'Cash Wallet','cash');
  return new;
end $$;
create trigger on_finance_user_created after insert on auth.users for each row execute function public.seed_finance_owner();

do $$ declare t text; begin
  foreach t in array array['user_settings','categories','accounts','payment_methods','tags','recurring_rules','recurring_occurrences','transactions','transaction_tags','currency_conversion_batches','currency_conversion_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy owner_only on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Settings currency and conversion history are changed only by the conversion function.
revoke insert, update, delete on public.user_settings from authenticated;
grant update (theme,time_zone) on public.user_settings to authenticated;
revoke insert, update, delete on public.currency_conversion_batches from authenticated;
revoke insert, update, delete on public.currency_conversion_lines from authenticated;

create or replace function public.check_ledger_currency() returns trigger language plpgsql as $$
declare active_currency text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  select currency_code into active_currency from public.user_settings where owner_id = new.owner_id;
  if active_currency is null or new.currency_code <> active_currency then
    raise exception 'Transaction currency must match the ledger currency';
  end if;
  return new;
end $$;
create trigger transaction_currency before insert or update on public.transactions
  for each row execute function public.check_ledger_currency();
create trigger recurring_currency before insert or update on public.recurring_rules
  for each row execute function public.check_ledger_currency();

create or replace function public.next_recurrence_date(d date, frequency public.recurrence_frequency, anchor smallint)
returns date language plpgsql immutable set search_path = public as $$
declare target_month date;
begin
  if frequency = 'weekly' then return d + 7; end if;
  if frequency = 'biweekly' then return d + 14; end if;
  target_month := (date_trunc('month', d)::date +
    case frequency when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '1 year' end)::date;
  return target_month + least(anchor, extract(day from (target_month + interval '1 month - 1 day'))::int) - 1;
end $$;

create or replace function public.review_recurring(p_rule_id uuid, p_action text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare r public.recurring_rules%rowtype; o_id uuid; t_id uuid; owner_today date;
begin
  if p_action is null or p_action not in ('post','skip') then raise exception 'Invalid action'; end if;
  select * into r from public.recurring_rules where id = p_rule_id and owner_id = auth.uid() for update;
  if not found or not r.active then raise exception 'Recurring rule unavailable'; end if;
  select (now() at time zone time_zone)::date into owner_today from public.user_settings where owner_id = auth.uid();
  if r.next_due_on > owner_today then raise exception 'This item is not due'; end if;
  insert into public.recurring_occurrences(owner_id,rule_id,due_on,status)
    values (r.owner_id,r.id,r.next_due_on,case when p_action = 'post' then 'posted'::public.occurrence_status else 'skipped'::public.occurrence_status end)
    returning id into o_id;
  if p_action = 'post' then
    insert into public.transactions(owner_id,transaction_date,amount_minor,currency_code,type,other_effect,category_id,payment_method_id,account_id,description,recurring_occurrence_id)
    values (r.owner_id,r.next_due_on,r.amount_minor,r.currency_code,r.type,r.other_effect,r.category_id,r.payment_method_id,r.account_id,r.description,o_id)
    returning id into t_id;
  end if;
  update public.recurring_rules set next_due_on = public.next_recurrence_date(r.next_due_on,r.frequency,r.anchor_day) where id = r.id;
  return t_id;
end $$;
revoke all on function public.review_recurring(uuid,text) from public, anon;
grant execute on function public.review_recurring(uuid,text) to authenticated;

create or replace function public.convert_ledger(p_to text, p_rate numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.user_settings%rowtype; b_id uuid; v_old bigint; v_new bigint; rec record;
begin
  if auth.uid() is null or p_to not in ('CAD','USD','EUR','GBP','AUD') or p_rate <= 0 or p_rate > 1000000 then
    raise exception 'Invalid currency or rate';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into s from public.user_settings where owner_id = auth.uid() for update;
  if not found or s.currency_code = p_to then raise exception 'Currency change unavailable'; end if;
  insert into public.currency_conversion_batches(owner_id,from_currency,to_currency,rate)
    values (auth.uid(),s.currency_code,p_to,p_rate) returning id into b_id;
  update public.user_settings set currency_code=p_to where owner_id=auth.uid();
  for rec in select id,amount_minor from public.transactions where owner_id = auth.uid() for update loop
    v_old := rec.amount_minor; v_new := round(v_old * p_rate);
    if v_new < 1 or v_new > 1000000000000 then raise exception 'Converted amount is outside the supported range'; end if;
    insert into public.currency_conversion_lines(owner_id,batch_id,entity_type,entity_id,old_amount_minor,new_amount_minor)
      values (auth.uid(),b_id,'transaction',rec.id,v_old,v_new);
    update public.transactions set amount_minor=v_new,currency_code=p_to where id=rec.id;
  end loop;
  for rec in select id,amount_minor from public.recurring_rules where owner_id = auth.uid() for update loop
    v_old := rec.amount_minor; v_new := round(v_old * p_rate);
    if v_new < 1 or v_new > 1000000000000 then raise exception 'Converted amount is outside the supported range'; end if;
    insert into public.currency_conversion_lines(owner_id,batch_id,entity_type,entity_id,old_amount_minor,new_amount_minor)
      values (auth.uid(),b_id,'recurring_rule',rec.id,v_old,v_new);
    update public.recurring_rules set amount_minor=v_new,currency_code=p_to where id=rec.id;
  end loop;
  return b_id;
end $$;
revoke all on function public.convert_ledger(text,numeric) from public, anon;
grant execute on function public.convert_ledger(text,numeric) to authenticated;
