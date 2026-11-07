-- Eine Leseregel pro Rolle (Performance-Hinweis von Supabase): Pflege-Regel in Anlegen/Ändern/Löschen aufteilen.
drop policy "Orte pflegen" on public.places;
create policy "Orte anlegen"  on public.places for insert to authenticated with check ((select public.is_admin()));
create policy "Orte ändern"   on public.places for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Orte löschen"  on public.places for delete to authenticated using ((select public.is_admin()));
