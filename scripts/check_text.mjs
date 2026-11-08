// Atemwetter – Textprüfung „Einfache Sprache“ (Regeln: docs/einfache-sprache.md).
// Prüft alle Texte, die Nutzerinnen und Nutzer sehen: index.html, public/*.html (außer Rechtstexten)
// und die Textbausteine in src/*.js – auch die Vorlagen für automatische Texte (Tagestipp, Tipp der Woche, Mitteilungen).
// Aufruf: node scripts/check_text.mjs          → Fehler brechen ab (läuft in npm run check und npm run build)
//         node scripts/check_text.mjs --all    → zusätzlich Hinweise und Rechtstexte anzeigen
import { readFileSync, readdirSync } from 'node:fs';

const ALL = process.argv.includes('--all');
const MAX_WORDS = 16;      // Fehler: Satz länger als 16 Wörter
const WARN_WORDS = 12;     // Hinweis: Satz länger als 12 Wörter
const LONG_WORD = 22;      // Hinweis: sehr lange Wörter

// Fachwörter → was stattdessen (oder dazu) stehen soll. Erlaubt, wenn im selben Text erklärt (siehe EXPLAIN).
const JARGON = {
  'inversion': 'wenig Luftaustausch / kalte Luft am Boden',
  'austauscharm': 'wenig Luftaustausch',
  'exazerbation': 'Verschlechterung, Anfall',
  'evidenz': 'Belege, Studienlage',
  'evidenzstufe': 'wie sicher die Belege sind',
  'metaanalyse': 'Zusammenfassung mehrerer Studien (dann erklären)',
  'cochrane-review': 'Cochrane-Übersicht (dann erklären)',
  'rct': 'Studie mit Zufallsverteilung',
  'einsekundenvolumen': 'Lungenfunktion (wie viel Luft man in einer Sekunde ausatmen kann)',
  'herzratenvariabilität': 'Schwankung des Herzschlags (erklären)',
  'signifikant': 'deutlich, eindeutig',
  'moderat': 'mittel, mäßig',
  'exposition': 'Belastung',
  'mechanismus': 'wie es wirkt',
  'befund': 'Ergebnis',
  'nullbefund': 'kein Effekt gefunden',
  'symptomatik': 'Beschwerden',
  'symptome': 'Beschwerden',
  'teilnehmende': 'Personen, Menschen',
  'probanden': 'Personen',
  'konzentration': 'Menge in der Luft',
  'aerosol': 'feine Teilchen in der Luft',
  'prävention': 'Vorbeugung',
  'indikation': 'Grund für eine Behandlung',
  'chronisch': 'dauerhaft (erklären)',
  'relevant': 'wichtig',
  'optimal': 'am besten',
  'durchmischung': 'Luftaustausch',
  'bodennah': 'am Boden',
  'interventionen': 'Maßnahmen',
  'ensemble': '(nur in Quellenangaben)',
  'modellwerte': 'berechnete Werte',
  'allergen': 'Auslöser einer Allergie',
  'kreuzallergie': 'zusammen auftretende Allergie (erklären)',
};
// Wörter, die nur mit Erklärung im selben Text stehen dürfen: Erklärung erkennt die Prüfung an diesen Mustern.
const EXPLAIN = /\(|:|–|, also |, das heißt|, d\. h\.|heißt:|bedeutet/;

function decode(s){ return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' '); }
function htmlTexts(file){
  let s = readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  // Inhalt von Quellenzeilen (doi-Links, Autorennamen) und Verwaltung (nur Betreuerinnen und Betreuer) auslassen
  s = s.replace(/<dialog[\s\S]*?<\/dialog>/gi, '').replace(/<section[^>]*id="dash"[\s\S]*$/i, '');
  return decode(s.replace(/<(p|li|h1|h2|h3|small|label|button|div|section|td|th|legend|span)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).split('\n');
}
function jsTexts(file){
  const s = readFileSync(file, 'utf8'), out = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g; let m;
  while((m = re.exec(s))){
    let t = (m[1] ?? m[2] ?? '').replace(/\\'/g, "'");
    if(!/[a-zäöüß]{3,} [a-zäöüß]{2,}/i.test(t)) continue;           // nur echte Sätze/Wortgruppen
    if(/^(https?:|\.\/|[a-z-]+\(|[#.][a-z])/i.test(t) || /=>|\bfunction\b|querySelector|getElementById/.test(t)) continue;
    t = decode(t.replace(/<[^>]+>/g, ' '));
    out.push(t);
  }
  return out;
}

const SOURCE = /doi\.org|doi:|et al\.|Quellen?:|Copernicus Atmosphere|CC BY|GeoSphere Austria \(|Daten:/i;
const files = [['index.html', htmlTexts('index.html')]];
for(const f of readdirSync('public').filter(f => f.endsWith('.html'))){
  const legal = /datenschutz|impressum/.test(f);
  if(legal && !ALL) continue;
  files.push(['public/' + f, htmlTexts('public/' + f), legal]);
}
for(const f of ['app.js', 'tips.js', 'pollen.js', 'notify.js', 'native.js', 'sw.js']) files.push(['src/' + f, jsTexts('src/' + f)]);

let errors = 0, warns = 0;
const seen = new Set();
for(const [file, texts, legal] of files){
  for(const raw of texts){
    const text = raw.replace(/\s+/g, ' ').trim();
    if(!text || seen.has(file + text) || SOURCE.test(text)) continue;
    seen.add(file + text);
    for(const sent of text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"])/)){
      const words = sent.split(' ').filter(w => /[A-Za-zÄÖÜäöüß0-9]/.test(w));
      if(words.length > MAX_WORDS && !legal){ errors++; console.log(`✗ ${file}: Satz mit ${words.length} Wörtern (max. ${MAX_WORDS}): „${sent.slice(0, 140)}${sent.length > 140 ? '…' : ''}“`); }
      else if(words.length > WARN_WORDS && ALL){ warns++; console.log(`· ${file}: langer Satz (${words.length} Wörter): „${sent.slice(0, 100)}…“`); }
      for(const w of words){ const c = w.replace(/[^A-Za-zÄÖÜäöüß-]/g, ''); if(c.length > LONG_WORD && ALL){ warns++; console.log(`· ${file}: langes Wort „${c}“`); } }
      const low = sent.toLowerCase();
      for(const [j, hint] of Object.entries(JARGON)){
        const re = new RegExp('(^|[^a-zäöüß])' + j.replace(/[-]/g, '\\-'), 'i');   // auch gebeugte Formen (relevante, moderate …)
        if(re.test(low) && !(EXPLAIN.test(sent) && /metaanalyse|cochrane|chronisch|kreuzallergie|herzraten|einsekunden/.test(j)) && !legal){
          errors++; console.log(`✗ ${file}: Fachwort „${j}“ → ${hint}: „${sent.slice(0, 120)}${sent.length > 120 ? '…' : ''}“`);
        }
      }
    }
  }
}
console.log(errors ? `\n${errors} Stelle(n) entsprechen nicht den Regeln für einfache Sprache (docs/einfache-sprache.md).` : 'Textprüfung einfache Sprache: in Ordnung' + (warns ? ` (${warns} Hinweise)` : '') + '.');
process.exit(errors ? 1 : 0);
