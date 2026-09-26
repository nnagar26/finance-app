-- Run after deploying the Edge Function and adding both values in Supabase Vault.
-- account_deletion_function_url: https://<project-ref>.supabase.co/functions/v1/purge-deleted-accounts
-- account_deletion_cron_secret: same random value as the Edge Function secret.
select cron.schedule(
  'purge-deleted-accounts-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'account_deletion_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'account_deletion_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
