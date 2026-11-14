# Atemwetter – Hinweise für Claude Code

Antworte auf Deutsch (Österreich). Wolfgang (MAYOKA andersch gsund OG, Dornbirn) ist Inhaber, kein Entwickler:
Erkläre Änderungen in Alltagssprache, ohne Fachjargon, und sag am Ende, was er sehen oder testen kann.

## Was die App ist
Kostenlose Atem- und Luftqualitäts-App für Österreich, Deutschland, die Schweiz und Liechtenstein (Schwerpunkt Rheintal) unter neutralem Namen, MAYOKA als Partner.
Ziel: Reichweite für MAYOKA über Ärzte, Selbsthilfegruppen, Kneippvereine und Unternehmen.
Ansichten: Heute (Luftqualitätsindex, Schadstoffe vs. WHO 2021, Luftaustausch, Pollen, Tagesverlauf, Tipp der Woche,
Persönlicher Tagestipp, Partner-Box), Allergie (Pollen-Check, Auswahl und Blühkalender mit rund 30 Pollen- und Sporenarten), Atmen (vier geführte Übungen mit Evidenz-Etikett), COPD, Asthma. Dashboard „Verwaltung“ für Admins.

## Aufbau
| Teil | Ort |
|---|---|
| Oberfläche (Markup) | `index.html` |
| Gestaltung (Farb-Tokens, Hell/Dunkel) | `src/styles.css` |
| Logik der Oberfläche | `src/app.js` (`startApp(data, api)`) |
| Datenzugriff Supabase, Login, Speichern | `src/data.js` |
| Live-Daten für den genauen Standort (Web und Android) | `src/live.js` |
| Android-Zusatz (Standort, Teilen, Selbst-Update) | `src/native.js` |
| Pollen- und Sporenkatalog (Blühzeiten, Hauptblüte, Allergiepotenzial) | `src/pollen.js` |
| Tagestipp und automatischer Tipp der Woche (gemeinsame Logik für App und Mitteilungen) | `src/tips.js` |
| Morgen-Mitteilung: Steuerung je Plattform | `src/notify.js` (App: LocalNotifications, 28 Tage im Voraus geplant; Browser: Web-Push mit `src/sw.js` → `dist/sw.js`; ein-/ausschaltbar über „Jeden Morgen als Mitteilung“) |
| Versand Web-Push (Schlüsselpaar in `app_secrets`, öffentlicher Teil in `content.push_public_key`) | Edge Function `supabase/functions/send-push` (in Supabase bereitgestellt, `verify_jwt` aus, Schutz über `app_secrets.cron_key`), ausgelöst von pg_cron alle 10 min (`atemwetter-push`). `scripts/send_push.mjs` + `push.yml` nur noch von Hand (Schlüssel anlegen). Nicht auf GitHub-Zeitpläne verlassen: die laufen verspätet oder gar nicht. |
| Öffentliche Verbindungsdaten | `src/config.js` (nur URL + anon-Schlüssel) |
| Datenbank-Schema und Zugriffsregeln | `supabase/migrations/*.sql`, Startdaten `supabase/seed.sql` |
| Tägliche Daten (GeoSphere, Copernicus) | `scripts/fetch_air.py`, `scripts/fetch_pollen.py`, `scripts/push_supabase.py`; `daily-data.yml` mit Ersatz-Zeiten (überspringt, wenn heute schon geschrieben) |
| Automatik | `.github/workflows/` (tägliche Daten, Web veröffentlichen, Android-Test-APK, `ios.yml` = iPhone-Prüfbau und TestFlight, `android-release.yml` = unterschriebene App als GitHub-Release) |
| Download-Seite Android | `public/android.html` (fester Link `releases/latest/download/atemwetter.apk`) |
| iPhone ohne App Store | `public/iphone.html` (Anleitung „Zum Home-Bildschirm“, QR `iphone-qr.svg`), `public/manifest.webmanifest`, `apple-touch-icon.png` |
| Android (Capacitor 7, `at.mayoka.atemwetter`) | `android/`, Lader `scripts/build-android.mjs` |
| iPhone (Capacitor 7, Swift Package Manager, gleiche ID) | `ios/`, `npm run ios`; Bau und TestFlight-Upload über `.github/workflows/ios.yml` (macOS bei GitHub, kein eigener Mac nötig) |

## Datenbank (Supabase, Region Frankfurt)
- `places` – Orte (Standardort `dornbirn`). Neue Orte als Zeile einfügen, nicht im Code.
- `air_days` – je Ort und Tag: `aqi_max`, `pm25`, `pm10`, `no2`, `o3_max`, `inversion`, `aqi_hourly`, `pollen`, `pollen_hourly`.
  Schreibt nur die GitHub-Action (service_role). Alte Tage löscht `cleanup_air_days()`.
- `content` – genau eine Zeile `id='main'`: `tip`, `partner`, `app_link`, `store_url`. Schreibt das Dashboard (Admins).
- `partner_codes` – Partner-Codes mit Einlösungen, nur Admins. Zählen über `change_code_count()`.
- `admins` – freigeschaltete Konten (Supabase-Auth-Nutzer-IDs).
- `push_subscriptions` – Browser-Anmeldungen für die Morgen-Mitteilung (nur Empfangsadresse, Ort, Uhrzeit; keine Gesundheitsangaben).
  Schreiben nur über `save_push_subscription()` / `delete_push_subscription()`, Versand mit service_role.
- `app_secrets` – nur service_role (VAPID-Schlüsselpaar). Profil und Allergien bleiben immer auf dem Gerät.
- Schema nur über **neue** Migrationsdateien ändern (`supabase/migrations/<Zeitstempel>_<name>.sql`), nie alte bearbeiten.
  Jede neue Tabelle bekommt RLS mit Regeln. Nach Änderungen die Advisors (Sicherheit, Performance) prüfen.

## Geheimnisse – nie in Code, Commits oder Antworten
- `SUPABASE_SERVICE_ROLE_KEY`, `ADS_API_KEY` (Copernicus), `ANDROID_KEYSTORE_B64`/`ANDROID_KEYSTORE_PASSWORD` (App-Signatur, Sicherung bei Wolfgang),
  `APPLE_TEAM_ID`, `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_P8` (iPhone/TestFlight): nur als GitHub-Secrets.
- Im Code steht ausschließlich der öffentliche anon-Schlüssel in `src/config.js`.

## Arbeiten
- Lokal: `npm install`, `npm run dev` (Vorschau), `npm run check`, `npm run build`.
- Ohne Supabase-Konfiguration nutzt die App `public/snapshot.json` – so lässt sich die Oberfläche immer testen.
- Nach jeder Änderung an der Oberfläche: `npm run build`, dann im Browser bei 390 px und 1280 px Breite, hell und dunkel,
  prüfen (Playwright-Screenshot). Kein horizontales Scrollen am Handy.
- Push auf `main` veröffentlicht die Web-App automatisch (GitHub Pages). Die Android-App lädt neue Programmversionen
  selbst (`version.json` + `app.html`) – außer bei Änderungen am nativen Teil (Plugins, Berechtigungen, Symbol):
  dann `shell` in `data/app-meta.json` um 1 erhöhen und neue App bauen (Workflow `android-release.yml` bzw. `ios.yml`): ältere Apps zeigen
  „Jetzt aktualisieren“ und installieren die neue Version **über** die alte (keine Neuinstallation, Einstellungen bleiben). `minShell` nur erhöhen,
  wenn ältere Apps neue Programmversionen gar nicht mehr laden dürfen – oder die neue Funktion so bauen, dass ältere Apps ohne die Erweiterung
  verständlich darauf hinweisen (so bei den Mitteilungen: `notify.js` → „native-old“) – und eine neue APK/AAB bauen (Play-Store-Update) bzw. eine neue iPhone-Version hochladen.
- Für größere Änderungen einen Branch und Pull Request anlegen und Wolfgang die Vorschau beschreiben.
- **Immer alle Anwendungen nachziehen** (Wunsch von Wolfgang): Nach jeder Veröffentlichung auf `main`
  1. Web: Lauf „Web-App veröffentlichen“ abwarten und online prüfen.
  2. Android: Workflow `android-release.yml` starten, damit Neu-Downloads die aktuelle Version enthalten (installierte Apps aktualisieren sich selbst).
  3. iPhone: Workflow `ios.yml` starten (Prüfbau; mit Apple-Secrets zusätzlich TestFlight). Die Home-Bildschirm-Version (`iphone.html`) ist die Website und damit automatisch aktuell.
  Beim Abschluss kurz melden, was in welcher App angekommen ist.

## Gestaltung
Ruhige Spalte, ab 960 px zwei Spalten. Farben nur als Tokens in `:root` (Hell- und Dunkelmodus).
Schriften: Familjen Grotesk (Titel), Atkinson Hyperlegible (Text), IBM Plex Mono (Zahlen).
MAYOKA-Farben (Tokens `--mk-*`: Orange `#fb8a40`, Hellblau `#5cc0de`) und Logo (`src/mayoka-logo.png`) nur in Partner-Elementen;
das Logo erscheint nur, wenn der Partnername „MAYOKA“ enthält.

**Stromsparen** (Wunsch von Wolfgang): keine Dauer-Zeitgeber oder Animationen außerhalb der Atemübung; Live-Verbindungen nur, solange die App sichtbar ist;
Standort automatisch nur sparsam (WLAN/Mobilfunk, bis 2 h alt), GPS nur auf Knopfdruck; Daten auf dem Gerät zwischenspeichern statt neu laden;
Bildschirm-Sperre (`wakeLock`) nur während der Übung.

## Inhaltliche Regeln
- **Einfache Sprache** für alle Texte, die Nutzer sehen – auch automatische (Tagestipp, Tipp der Woche, Mitteilungen, Hinweise):
  Regeln und Wortliste in `docs/einfache-sprache.md` (Sätze höchstens 16 Wörter, Alltagswörter, Fachwörter erklären,
  Studien so beschreiben: was untersucht, was herausgekommen, wie sicher). `scripts/check_text.mjs` prüft das bei
  `npm run check` und `npm run build`; ein Verstoß stoppt den Bau. `npm run texte` zeigt zusätzlich Hinweise.
  Kennzeichnungen selbsterklärend als Wort-Schild (z. B. „Vorhersage“, „Kalender“), nicht als Punkt oder Symbol.
- Begriffe: „Longevity“ als Leitbegriff, dazu Wellness, Gesundheit, Auszeit. Longevity als Thema, nie als Versprechen.
- Sauerstoff-Sole-Inhalationsraum immer als Ergänzung, nie als Therapie oder Heilversprechen.
- Partner-Hinweise: dezent, auf allen Seiten, als „Partner-Angebot“ gekennzeichnet, pro Tag ausblendbar;
  bei COPD, Asthma und Allergie erst unter den medizinischen Inhalten mit Hinweis „kein Ersatz für ärztliche Behandlung“.
  Beim Tagestipp (`partnerLine()` in `src/tips.js`): nur in der App, nie in Mitteilungen; nur an Tagen mit trüber Luft,
  Ozon, vielen Pollen oder Kälte; nur im Umkreis von 45 km um Dornbirn; höchstens alle 3 Tage.
- Medizinische Texte: PubMed-Quellen mit DOI-Link, Evidenzstufe nennen (RCT, Metaanalyse, Beobachtungsstudie …),
  Nullbefunde erwähnen, Herstellerangaben von unabhängigen Belegen trennen, aktuellen Forschungsstand prüfen.
- Standort nur nach ausdrücklicher Freischaltung per Häkchen; bleibt auf dem Gerät.
- Quellenangaben Pflicht: GeoSphere Austria (CC BY 4.0), Copernicus CAMS.
- GeoSphere-Datensätze: Luft `chem-v2-1h-3km` (bis ca. 53,7° N), außerhalb `chem-v2-1h-9km` (Europa); Wetter `nwp-v2-1h-1km` (bis ca. 51,5° N, weiter nördlich kein Luftaustausch; v1 im Nov. 2026 eingestellt). Fehlt der Luftaustausch, zuerst `/metadata` des Datensatzes auf `last_forecast_reftime` prüfen.
