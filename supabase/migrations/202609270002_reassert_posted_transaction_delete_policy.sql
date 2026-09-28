-- Reassert the delete behavior for deployments whose schema did not receive
-- the original posted-transaction preservation migration.
alter table public.transactions
  drop constraint if exists transactions_owner_id_recurring_occurrence_id_fkey;

alter table public.transactions
  add constraint transactions_owner_id_recurring_occurrence_id_fkey
  foreign key (owner_id, recurring_occurrence_id)
  references public.recurring_occurrences(owner_id, id)
  on delete set null (recurring_occurrence_id);
