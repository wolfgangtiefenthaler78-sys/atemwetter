-- pg_net nicht im öffentlichen Bereich (Sicherheitshinweis von Supabase); die Funktionen liegen ohnehin im Schema „net“.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
