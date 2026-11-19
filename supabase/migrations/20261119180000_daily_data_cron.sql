-- Tägliche Luft- und Pollendaten zuverlässig am Morgen: Die Datenbank stößt den GitHub-Ablauf
-- „daily-data.yml“ selbst an (GitHub startet eigene Zeitpläne manchmal stark verspätet oder gar nicht).
-- pg_cron ruft trigger_daily_data() zwischen 05:45 und 09:45 Uhr (Wiener Winterzeit) stündlich auf.
-- Die Funktion tut nichts, wenn
--   * die Daten heute (Wiener Datum) schon geschrieben wurden,
--   * kein GitHub-Schlüssel hinterlegt ist (app_secrets.name = 'github_token'),
--   * der letzte Anstoß weniger als 50 Minuten her ist (ein Lauf dauert bis zu ~15 Minuten).
-- Der GitHub-Schlüssel (fine-grained token, nur Repository „atemwetter“, Recht „Actions: Read and write“)
-- wird von Hand im Supabase-SQL-Editor eingetragen, nie im Code.

create or replace function public.trigger_daily_data()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_last  timestamptz;
  v_sent  timestamptz;
  v_today date := (now() at time zone 'Europe/Vienna')::date;
begin
  select max(updated_at) into v_last from public.air_days;
  if v_last is not null and (v_last at time zone 'Europe/Vienna')::date = v_today then
    return 'schon aktuell';
  end if;

  select value into v_token from public.app_secrets where name = 'github_token';
  if v_token is null or v_token = '' then
    return 'kein GitHub-Schlüssel hinterlegt';
  end if;

  select nullif(value, '')::timestamptz into v_sent from public.app_secrets where name = 'daily_data_dispatched_at';
  if v_sent is not null and v_sent > now() - interval '50 minutes' then
    return 'Lauf wurde gerade erst angestoßen';
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/wolfgangtiefenthaler78-sys/atemwetter/actions/workflows/daily-data.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'atemwetter-supabase-cron',
      'Content-Type', 'application/json'),
    body := '{"ref":"main"}'::jsonb,
    timeout_milliseconds := 30000);

  insert into public.app_secrets (name, value) values ('daily_data_dispatched_at', now()::text)
  on conflict (name) do update set value = excluded.value;
  return 'angestoßen';
end;
$$;

-- Nur der Zeitgeber (Datenbank-Eigentümer) darf die Funktion ausführen
revoke all on function public.trigger_daily_data() from public, anon, authenticated;

-- 04:45–08:45 UTC = 05:45–09:45 Wien im Winter (06:45–10:45 im Sommer)
select cron.unschedule('atemwetter-daily-data') where exists (select 1 from cron.job where jobname = 'atemwetter-daily-data');
select cron.schedule('atemwetter-daily-data', '45 4-8 * * *', $$ select public.trigger_daily_data(); $$);
