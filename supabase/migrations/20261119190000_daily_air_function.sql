-- Luftwerte am Morgen ohne GitHub: trigger_daily_data() ruft die Edge Function „daily-air“ auf,
-- wenn heute (Wiener Datum) noch keine Daten in air_days stehen. Sie holt GeoSphere-Werte für alle Orte
-- und schreibt nur die Luftspalten. Pollen kommen weiter aus dem GitHub-Lauf (Copernicus); der setzt
-- dafür app_secrets.pollen_updated. Ist zusätzlich ein GitHub-Schlüssel hinterlegt (app_secrets.github_token),
-- stößt die Funktion den GitHub-Lauf an, solange die Pollen von heute fehlen.
create or replace function public.trigger_daily_data()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := (now() at time zone 'Europe/Vienna')::date;
  v_last   timestamptz;
  v_called timestamptz;
  v_pollen text;
  v_token  text;
  v_sent   timestamptz;
  v_out    text := '';
begin
  -- 1) Luftwerte über die Edge Function
  select max(updated_at) into v_last from public.air_days;
  select nullif(value, '')::timestamptz into v_called from public.app_secrets where name = 'daily_air_called_at';
  if v_last is not null and (v_last at time zone 'Europe/Vienna')::date = v_today then
    v_out := 'Luft aktuell';
  elsif v_called is not null and v_called > now() - interval '30 minutes' then
    v_out := 'Luft: Abruf läuft';
  else
    perform net.http_post(
      url := 'https://evrcdznvgasiaszgxsnn.supabase.co/functions/v1/daily-air',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-cron-key', (select value from public.app_secrets where name = 'cron_key')),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000);
    insert into public.app_secrets (name, value) values ('daily_air_called_at', now()::text)
    on conflict (name) do update set value = excluded.value;
    v_out := 'Luft: Abruf gestartet';
  end if;

  -- 2) Pollen über GitHub (nur mit hinterlegtem Schlüssel)
  select value into v_pollen from public.app_secrets where name = 'pollen_updated';
  select value into v_token from public.app_secrets where name = 'github_token';
  select nullif(value, '')::timestamptz into v_sent from public.app_secrets where name = 'daily_data_dispatched_at';
  if v_pollen = v_today::text then
    v_out := v_out || ' · Pollen aktuell';
  elsif v_token is null or v_token = '' then
    v_out := v_out || ' · Pollen: wartet auf GitHub-Zeitplan';
  elsif v_sent is not null and v_sent > now() - interval '50 minutes' then
    v_out := v_out || ' · Pollen: Lauf angestoßen';
  else
    perform net.http_post(
      url := 'https://api.github.com/repos/wolfgangtiefenthaler78-sys/atemwetter/actions/workflows/daily-data.yml/dispatches',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Accept', 'application/vnd.github+json',
                                    'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'atemwetter-supabase-cron',
                                    'Content-Type', 'application/json'),
      body := '{"ref":"main"}'::jsonb,
      timeout_milliseconds := 30000);
    insert into public.app_secrets (name, value) values ('daily_data_dispatched_at', now()::text)
    on conflict (name) do update set value = excluded.value;
    v_out := v_out || ' · Pollen: GitHub-Lauf angestoßen';
  end if;
  return v_out;
end;
$$;

revoke all on function public.trigger_daily_data() from public, anon, authenticated;
