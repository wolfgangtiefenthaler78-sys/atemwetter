# Atemwetter – Hinweise für Claude Code

Antworte auf Deutsch (Österreich). Wolfgang (MAYOKA andersch gsund OG, Dornbirn) ist Inhaber, kein Entwickler:
Erkläre Änderungen in Alltagssprache, ohne Fachjargon, und sag am Ende, was er sehen oder testen kann.

## Was die App ist
Kostenlose Atem- und Luftqualitäts-App für Österreich und das Rheintal unter neutralem Namen, MAYOKA als Partner.
Ziel: Reichweite für MAYOKA über Ärzte, Selbsthilfegruppen, Kneippvereine und Unternehmen.
Ansichten: Heute (Luftqualitätsindex, Schadstoffe vs. WHO 2021, Luftaustausch, Pollen, Tagesverlauf, Tipp der Woche,
Partner-Box), Atmen (vier geführte Übungen mit Evidenz-Etikett), COPD, Allergie. Dashboard „Verwaltung“ für Admins.

## Aufbau
| Teil | Ort |
|---|---|
| Oberfläche (Markup) | `index.html` |
| Gestaltung (Farb-Tokens, Hell/Dunkel) | `src/styles.css` |
| Logik der Oberfläche | `src/app.js` (`startApp(data, api)`) |
| Datenzugriff Supabase, Login, Speichern | `src/data.js` |
| Android-Zusatz (GPS-Live-Daten, Teilen, Selbst-Update) | `src/native.js` |
| Öffentliche Verbindungsdaten | `src/config.js` (nur URL + anon-Schlüssel) |
| Datenbank-Schema und Zugriffsregeln | `supabase/migrations/*.sql`, Startdaten `supabase/seed.sql` |
| Tägliche Daten (GeoSphere, Copernicus) | `scripts/fetch_air.py`, `scripts/fetch_pollen.py`, `scripts/push_supabase.py` |
| Automatik | `.github/workflows/` (tägliche Daten, Web veröffentlichen, Android-APK) |
| Android (Capacitor 7, `at.mayoka.atemwetter`) | `android/`, Lader `scripts/build-android.mjs` |

## Datenbank (Supabase, Region Frankfurt)
- `places` – Orte (Standardort `dornbirn`). Neue Orte als Zeile einfügen, nicht im Code.
- `air_days` – je Ort und Tag: `aqi_max`, `pm25`, `pm10`, `no2`, `o3_max`, `inversion`, `aqi_hourly`, `pollen`, `pollen_hourly`.
  Schreibt nur die GitHub-Action (service_role). Alte Tage löscht `cleanup_air_days()`.
- `content` – genau eine Zeile `id='main'`: `tip`, `partner`, `app_link`, `store_url`. Schreibt das Dashboard (Admins).
- `partner_codes` – Partner-Codes mit Einlösungen, nur Admins. Zählen über `change_code_count()`.
- `admins` – freigeschaltete Konten (Supabase-Auth-Nutzer-IDs).
- Schema nur über **neue** Migrationsdateien ändern (`supabase/migrations/<Zeitstempel>_<name>.sql`), nie alte bearbeiten.
  Jede neue Tabelle bekommt RLS mit Regeln. Nach Änderungen die Advisors (Sicherheit, Performance) prüfen.

## Geheimnisse – nie in Code, Commits oder Antworten
- `SUPABASE_SERVICE_ROLE_KEY`, `ADS_API_KEY` (Copernicus): nur als GitHub-Secrets.
- Im Code steht ausschließlich der öffentliche anon-Schlüssel in `src/config.js`.

## Arbeiten
- Lokal: `npm install`, `npm run dev` (Vorschau), `npm run check`, `npm run build`.
- Ohne Supabase-Konfiguration nutzt die App `public/snapshot.json` – so lässt sich die Oberfläche immer testen.
- Nach jeder Änderung an der Oberfläche: `npm run build`, dann im Browser bei 390 px und 1280 px Breite, hell und dunkel,
  prüfen (Playwright-Screenshot). Kein horizontales Scrollen am Handy.
- Push auf `main` veröffentlicht die Web-App automatisch (GitHub Pages). Die Android-App lädt neue Programmversionen
  selbst (`version.json` + `app.html`) – außer bei Änderungen am nativen Teil (Plugins, Berechtigungen, Symbol):
  dann `minShell` in `data/app-meta.json` erhöhen und eine neue APK/AAB bauen (Play-Store-Update).
- Für größere Änderungen einen Branch und Pull Request anlegen und Wolfgang die Vorschau beschreiben.

## Gestaltung
Ruhige Spalte, ab 960 px zwei Spalten. Farben nur als Tokens in `:root` (Hell- und Dunkelmodus).
Schriften: Familjen Grotesk (Titel), Atkinson Hyperlegible (Text), IBM Plex Mono (Zahlen).
MAYOKA-Farben (Tokens `--mk-*`: Orange `#fb8a40`, Hellblau `#5cc0de`) und Logo (`src/mayoka-logo.png`) nur in Partner-Elementen;
das Logo erscheint nur, wenn der Partnername „MAYOKA“ enthält.

## Inhaltliche Regeln
- Begriffe: „Longevity“ als Leitbegriff, dazu Wellness, Gesundheit, Auszeit. Longevity als Thema, nie als Versprechen.
- Sauerstoff-Sole-Inhalationsraum immer als Ergänzung, nie als Therapie oder Heilversprechen.
- Partner-Hinweise: dezent, auf allen Seiten, als „Partner-Angebot“ gekennzeichnet, pro Tag ausblendbar;
  bei COPD und Allergie erst unter den medizinischen Inhalten mit Hinweis „kein Ersatz für ärztliche Behandlung“.
- Medizinische Texte: PubMed-Quellen mit DOI-Link, Evidenzstufe nennen (RCT, Metaanalyse, Beobachtungsstudie …),
  Nullbefunde erwähnen, Herstellerangaben von unabhängigen Belegen trennen, aktuellen Forschungsstand prüfen.
- Standort nur nach ausdrücklicher Freischaltung per Häkchen; bleibt auf dem Gerät.
- Quellenangaben Pflicht: GeoSphere Austria (CC BY 4.0), Copernicus CAMS.
- GeoSphere-Datensätze: Luft `chem-v2-1h-3km`, Wetter `nwp-v2-1h-1km` (v1 im Nov. 2026 eingestellt). Fehlt der Luftaustausch, zuerst `/metadata` des Datensatzes auf `last_forecast_reftime` prüfen.
