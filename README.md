# Atemwetter

Luftqualität, Pollen, Atemübungen und Tageshinweise für COPD und Allergie – für Orte in Österreich und dem Rheintal.
Ein Service in Partnerschaft mit MAYOKA andersch gsund, Dornbirn.

**Weiterentwickeln:** Dieses Repository in Claude Code öffnen (claude.ai/code → Repository „atemwetter“ wählen)
und in normaler Sprache beschreiben, was sich ändern soll. Claude Code liest `CLAUDE.md` und kennt damit Aufbau und Regeln.

## So hängt alles zusammen
```
GeoSphere Austria ─┐                       ┌─> Web-App (GitHub Pages)
Copernicus CAMS ───┼─> GitHub-Action ─> Supabase-Datenbank ─┤
                   │   (täglich 05:41)     ▲                └─> Android-App (liest live, lädt neue Versionen selbst)
                   │                       │
                   └──────────── Dashboard „Verwaltung“ (Login per E-Mail-Link)
```

## Einmalige Einrichtung
1. **Supabase-Projekt** (Region Frankfurt): Migration `supabase/migrations/…_init.sql` und `supabase/seed.sql` ausführen.
   Unter Authentication → URL Configuration die Adresse der Web-App als Site URL und Redirect URL eintragen.
   Eigenes Konto unter Authentication → Users einladen, dann `insert into public.admins (user_id) values ('<ID>');`
2. **`src/config.js`**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (öffentlich) und `SITE_URL` eintragen.
3. **GitHub → Settings → Secrets and variables → Actions**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADS_API_KEY`.
4. **GitHub → Settings → Pages**: Source „GitHub Actions“.
5. Unter **Actions** einmal „Tägliche Luft- und Pollendaten“ von Hand starten.

## Alltag
| Was | Wie |
|---|---|
| Tipp der Woche, Partner-Box, Links | Web-App → „Verwaltung“ (Fußzeile) → anmelden → speichern. Wirkt sofort in Web und Android. |
| Partner-Codes zählen | Dashboard → Partner-Codes |
| Neuer Ort | Zeile in Tabelle `places` (oder Claude Code bitten) |
| Programm ändern | Claude Code → Änderung → Push auf `main` → Web automatisch; Android lädt die neue Version selbst |
| Android-Test-APK | Actions → „Android-Test-APK bauen“ → Run workflow → APK unter „Artifacts“ |

## Datenquellen
GeoSphere Austria Data Hub (`chem-v2-1h-3km`, `nwp-v1-1h-2500m`, CC BY 4.0) · Copernicus Atmosphere Monitoring Service
(`cams-europe-air-quality-forecasts`, Ensemble, Copernicus-Lizenz). Luftqualitätsindex nach EEA-Bändern (Revision 2024).
