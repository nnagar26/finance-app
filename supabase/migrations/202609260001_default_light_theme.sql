-- New ledgers begin in light mode. Existing users keep their saved preference.
alter table public.user_settings alter column theme set default 'light';
