-- Morgen-Mitteilung (Web-Push) für den persönlichen Tagestipp.
-- Gespeichert wird nur, was zum Zustellen nötig ist: technische Empfangsadresse des Browsers mit Schlüsseln,
-- Ort (für die Tageswerte) und Uhrzeit. Profil und Allergien bleiben auf dem Gerät und werden nie übertragen.

create table public.push_subscriptions (
  endpoint    text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh      text not null check (length(p256dh) <= 200),
  auth        text not null check (length(auth) <= 100),
  place_id    text not null references public.places(id) on delete cascade,
  hour        smallint not null check (hour between 5 and 11),
  last_sent   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index push_subscriptions_place_idx on public.push_subscriptions (place_id);
alter table public.push_subscriptions enable row level security;
-- Bewusst keine Regeln für anon/authenticated: Zugriff nur über die beiden Funktionen unten
-- bzw. für den Versand über den service_role-Schlüssel (GitHub-Action).

-- Schlüsselpaar für Web-Push (VAPID). Nur service_role; der öffentliche Teil steht zusätzlich in content.push_public_key.
create table public.app_secrets (
  name   text primary key,
  value  text not null
);
alter table public.app_secrets enable row level security;

alter table public.content add column if not exists push_public_key text not null default '';

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_place text, p_hour integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_subscriptions (endpoint, p256dh, auth, place_id, hour)
  values (p_endpoint, p_p256dh, p_auth, p_place, p_hour)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, place_id = excluded.place_id,
        hour = excluded.hour, updated_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.save_push_subscription(text, text, text, text, integer) from public;
revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.save_push_subscription(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;
