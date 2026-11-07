-- Funktionen laufen mit den Rechten des Aufrufers; die Zugriffsregeln (RLS) entscheiden.
create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.change_code_count(code_id uuid, delta integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  update public.partner_codes set count = greatest(0, count + delta) where id = code_id returning count into n;
  if n is null then raise exception 'nicht berechtigt oder nicht gefunden'; end if;
  return n;
end $$;
revoke execute on function public.change_code_count(uuid, integer) from public, anon;
grant execute on function public.change_code_count(uuid, integer) to authenticated;

revoke execute on function public.cleanup_air_days(integer) from public, anon, authenticated;
