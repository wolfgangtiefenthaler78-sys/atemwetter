-- Atemwetter – Grundschema
-- Lesen: alle (auch ohne Anmeldung) für Orte, Tagesdaten, Inhalte.
-- Schreiben: Inhalte und Partner-Codes nur für Admins (Tabelle admins).
-- Tagesdaten schreibt nur die tägliche GitHub-Action mit dem service_role-Schlüssel (umgeht RLS).

create table public.places (
  id      text primary key,
  name    text not null,
  region  text not null default '',
  lat     double precision not null,
  lon     double precision not null,
  elev    integer not null default 0,
  sort    integer not null default 0,
  active  boolean not null default true
);

create table public.air_days (
  place_id      text not null references public.places(id) on delete cascade,
  date          date not null,
  aqi_max       integer,
  pm25          real,
  pm10          real,
  no2           real,
  o3_max        real,
  inversion     jsonb,
  aqi_hourly    jsonb not null default '[]'::jsonb,
  pollen        jsonb,
  pollen_hourly jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (place_id, date)
);
create index air_days_date_idx on public.air_days (date);

create table public.content (
  id          text primary key default 'main' check (id = 'main'),
  tip         jsonb not null default '{}'::jsonb,
  partner     jsonb not null default '{}'::jsonb,
  app_link    text not null default '',
  store_url   text not null default '',
  updated_at  timestamptz not null default now()
);

create table public.partner_codes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 120),
  code        text not null unique check (code ~ '^[A-Z0-9-]{2,24}$'),
  count       integer not null default 0 check (count >= 0),
  created_at  timestamptz not null default now()
);

create table public.admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  note     text
);

-- Hilfsfunktion: ist der angemeldete Nutzer Admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Einlösungen zählen (atomar, nur Admins)
create or replace function public.change_code_count(code_id uuid, delta integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'nicht berechtigt'; end if;
  update public.partner_codes set count = greatest(0, count + delta) where id = code_id returning count into n;
  return n;
end $$;
revoke all on function public.change_code_count(uuid, integer) from public;
grant execute on function public.change_code_count(uuid, integer) to authenticated;

-- Zugriffsregeln
alter table public.places        enable row level security;
alter table public.air_days      enable row level security;
alter table public.content       enable row level security;
alter table public.partner_codes enable row level security;
alter table public.admins        enable row level security;

create policy "Orte lesen"        on public.places   for select to anon, authenticated using (true);
create policy "Orte pflegen"      on public.places   for all    to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Tagesdaten lesen"  on public.air_days for select to anon, authenticated using (true);
create policy "Inhalte lesen"     on public.content  for select to anon, authenticated using (true);
create policy "Inhalte anlegen"   on public.content  for insert to authenticated with check ((select public.is_admin()));
create policy "Inhalte ändern"    on public.content  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Codes verwalten"   on public.partner_codes for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Eigene Admin-Zeile lesen" on public.admins for select to authenticated using (user_id = (select auth.uid()));

-- Live-Aktualisierung der Inhalte in Web- und Android-App
alter publication supabase_realtime add table public.content;

-- Alte Tagesdaten aufräumen (wird von der täglichen Aktualisierung aufgerufen)
create or replace function public.cleanup_air_days(keep_days integer default 7)
returns void language sql security definer set search_path = '' as $$
  delete from public.air_days where date < (now() at time zone 'Europe/Vienna')::date - keep_days;
$$;
revoke all on function public.cleanup_air_days(integer) from public, anon, authenticated;
