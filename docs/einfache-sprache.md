# Einfache Sprache in Atemwetter

Atemwetter richtet sich an alle: ältere Menschen, Menschen mit Atemwegserkrankungen, Eltern, Menschen mit wenig Deutsch.
Darum gelten für **alle Texte**, die Nutzerinnen und Nutzer sehen – auch für automatisch erzeugte (Tagestipp, Tipp der Woche,
Mitteilungen, Hinweise) – diese Regeln. Ziel ist Sprachniveau **B1 („Einfache Sprache“)**.

Die Datei `scripts/check_text.mjs` prüft die Regeln automatisch bei `npm run check` und `npm run build`.
Verstöße brechen den Bau ab. Hinweise zu langen Sätzen und Wörtern zeigt `node scripts/check_text.mjs --all`.

## Die Regeln

1. **Kurze Sätze.** Höchstens 16 Wörter, besser 8 bis 12. Ein Gedanke pro Satz.
2. **Alltagswörter statt Fachwörter.** Wenn ein Fachwort nötig ist: erklären, z. B. „Peak-Flow (wie kräftig du ausatmen kannst)“.
3. **Aktiv und direkt.** „Lüfte zu Mittag.“ statt „Ein Lüften zur Mittagszeit wird empfohlen.“ Ansprache mit „du“.
4. **Zuerst das Wichtigste.** Erst was zu tun ist, dann warum.
5. **Zahlen als Ziffern.** „3 Monate“, „2 bis 3 Prozent“. Einheiten nur, wenn nötig, und immer gleich (µg/m³).
6. **Listen statt Aufzählungen im Satz.** Mehr als drei Punkte → Liste.
7. **Keine Abkürzungen** außer bekannten (z. B. WHO, COPD). „z. B.“ ist erlaubt, „bzw.“ möglichst vermeiden.
8. **Studien verständlich erklären.** Immer: Was wurde untersucht? Was kam heraus? Wie sicher ist das?
   - Zusammenfassung vieler Studien (Fachwort: Metaanalyse)
   - Cochrane-Übersicht (besonders sorgfältige Zusammenfassung vieler Studien)
   - Studie mit Zufalls-Gruppen (Fachwort: randomisiert) – das macht Ergebnisse verlässlicher
   - Beobachtungs-Studie: zeigt einen Zusammenhang, aber keinen sicheren Beweis
   - Ergebnisse ohne Wirkung immer nennen: „Bei X war kein klarer Effekt zu sehen.“
9. **Keine Angst machen, nichts versprechen.** Ruhig und sachlich. Kein Heilversprechen.
10. **Gleiche Dinge gleich benennen.** Siehe Wortliste.

## Wortliste (so schreiben wir)

| statt | schreiben wir |
|---|---|
| Prognose, Tagesprognose | Vorhersage, Tages-Vorhersage |
| Modellwerte | berechnete Werte |
| Inversion, austauscharme Wetterlage | wenig Luftaustausch |
| Durchmischung | Luftaustausch |
| bodennah | am Boden |
| Exazerbation | Verschlechterung, Anfall |
| Symptome, Symptomatik | Beschwerden |
| Teilnehmende, Probanden | Menschen, Personen |
| Befund | Ergebnis |
| Evidenz | Belege |
| moderat | mittel, mittelmäßig |
| signifikant | deutlich, klar |
| relevant | wichtig |
| Konzentration (in der Luft) | Menge in der Luft |
| Tagesmittel | Durchschnitt des Tages |
| Bedarfsspray | Notfallspray (Bedarfsspray) – beim ersten Mal beides |
| Dauertherapie | Dauer-Medikamente |
| Allergologin, Allergologe | Allergie-Ärztin, Allergie-Arzt |

## Automatische Texte

Vorlagen in `src/tips.js` (Tagestipp, Tipp der Woche), `src/app.js` (Tageshinweise COPD, Asthma, Allergie)
und `src/notify.js` (Mitteilungen) folgen denselben Regeln. Eingesetzte Werte (Ort, Pollenart, Zahl) dürfen einen Satz
nicht über 16 Wörter verlängern. Ein Tagestipp hat höchstens 4 Sätze.
