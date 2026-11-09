-- Morgen-Mitteilung (Web-Push): Versand zeitgenau aus der Datenbank statt über die GitHub-Zeitsteuerung
-- (die lief verspätet oder gar nicht). pg_cron ruft alle 10 Minuten die Edge Function „send-push“ auf;
-- sie schickt nur fällige Mitteilungen (Uhrzeit erreicht, heute noch nicht gesendet).
create extension if not exists pg_cron;
create extension if not exists pg_net;   -- in 20261109101000 ins Schema „extensions“ verschoben

-- Zufälliger Schlüssel, mit dem nur dieser Zeitgeber die Edge Function auslösen darf (bleibt in app_secrets, nur service_role).
insert into public.app_secrets (name, value)
values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

select cron.unschedule('atemwetter-push') where exists (select 1 from cron.job where jobname = 'atemwetter-push');
select cron.schedule('atemwetter-push', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://evrcdznvgasiaszgxsnn.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-key', (select value from public.app_secrets where name = 'cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$$);
