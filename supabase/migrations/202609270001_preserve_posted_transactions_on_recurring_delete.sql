-- Deleting a recurring rule removes its occurrence history, but posted transactions
-- remain in the ledger and continue to contribute to reports.
alter table public.transactions
  drop constraint transactions_owner_id_recurring_occurrence_id_fkey;

alter table public.transactions
  add constraint transactions_owner_id_recurring_occurrence_id_fkey
  foreign key (owner_id, recurring_occurrence_id)
  references public.recurring_occurrences(owner_id, id)
  on delete set null (recurring_occurrence_id);
