/* Atemwetter – Tagestipp und automatischer Tipp der Woche.
   Reine Logik ohne Bildschirmzugriff: wird von der App, vom Service Worker (Mitteilungen im Browser)
   und für die geplanten Mitteilungen der Android- und iPhone-App verwendet.
   Persönliche Angaben (Profil, Allergien) bleiben auf dem Gerät; der Server kennt sie nicht. */
import { POLLEN_NAMES, pollenLevel, SEASON, SEASON_BY, MN } from './pollen.js';

const fmt = (n, d = 0) => Number(n).toLocaleString('de-AT', { minimumFractionDigits: d, maximumFractionDigits: d });
const hh = h => String(h).padStart(2, '0') + ':00 Uhr';
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1];

/** Übung, die zum Profil passt. */
export function exerciseFor(profile){
  const p = profile || {};
  return p.copd ? { id: 'lippen', name: 'Lippenbremse' } : p.asthma ? { id: 'bauch', name: 'Bauchatmung' } : { id: 'ruhig', name: 'Ruhige Atmung' };
}

/**
 * Persönlicher Tagestipp.
 * @param day   Tageswerte eines Ortes: {date, aqi_max, pm25, no2, o3_max, inversion:{level,t2m}, pollen:{}, pollen_hourly:{}}
 * @param prefs {profile:{allergy,asthma,copd}, allergens:[Katalog-IDs]}
 * @returns {title, text, level (1 ruhig, 2 achtsam, 3 Vorsicht), ex:{id,name}}
 */
export function dailyTip(day, prefs, placeName){
  day = day || {}; prefs = prefs || {};
  const pr = prefs.profile || {}, sel = (prefs.allergens || []).filter(k => SEASON_BY[k]);
  const sens = !!(pr.asthma || pr.copd);
  const allergic = !!(pr.allergy || pr.asthma || sel.length);
  const m = day.date ? new Date(day.date + 'T12:00:00').getMonth() : new Date().getMonth();
  const inv = day.inversion || {}, items = [];
  const add = (w, head, text) => items.push({ w, head, text });

  // Pollen mit Tagesprognose (Copernicus)
  const keys = sel.length ? sel.filter(k => POLLEN_NAMES[k]) : (allergic ? Object.keys(POLLEN_NAMES) : []);
  let top = null;
  keys.forEach(k => { const v = (day.pollen || {})[k] || 0, L = pollenLevel(k, v); if(L.i >= 2 && (!top || L.i > top.i || (L.i === top.i && v > top.v))) top = { k, v, i: L.i }; });
  if(top){
    const P = SEASON_BY[top.k], ph = (day.pollen_hourly || {})[top.k];
    let low = '';
    if(ph && ph.length){ let lo = 6; for(let h = 6; h <= 20; h++) if((ph[h] || 0) < (ph[lo] || 0)) lo = h; low = ' Am wenigsten fliegen laut Prognose gegen ' + hh(lo) + ', ein guter Moment zum Stoßlüften.'; }
    add(top.i === 3 ? 9 : 6, P.pn + ' ' + (top.i === 3 ? 'hoch' : 'mäßig'),
      (top.i === 3 ? 'Heute fliegen viele ' : 'Heute fliegen spürbar ') + P.pn + '.' + low + (pr.asthma ? ' Bedarfsspray griffbereit halten.' : ''));
  }
  // Gewählte Arten ohne Tagesprognose: Blühkalender
  const cal = sel.map(k => SEASON_BY[k]).filter(P => !P.k && P.pk.includes(m));
  if(cal.length) add(cal.some(P => P.pot >= 2) ? 5 : 2, 'Hauptblüte: ' + list(cal.map(P => P.n)),
    'Laut Blühkalender ist jetzt Hauptblüte von ' + list(cal.map(P => P.n)) + '. Dafür gibt es keine Tagesprognose; achte heute besonders auf Beschwerden.');

  // Luft
  if(day.aqi_max > 60) add(sens ? 9 : 7, 'Belastete Luft', 'Die Luftqualität ist heute schlecht (Index ' + day.aqi_max + '). Anstrengung im Freien kurz halten' + (sens ? ' und das Notfall- bzw. Bedarfsspray dabeihaben.' : '.'));
  else if(day.aqi_max > 40) add(sens ? 6 : 4, 'Mäßige Luft', 'Die Luft ist heute nur mäßig (Index ' + day.aqi_max + '). Längere Bewegung lieber abseits von Hauptstraßen.');
  if(day.o3_max > 120) add(sens ? 7 : 4, 'Viel Ozon', 'Am Nachmittag viel Ozon (bis ' + fmt(day.o3_max) + ' µg/m³). Sport im Freien besser auf den Vormittag legen.');
  if(inv.level === 'stark') add(sens ? 6 : 4, 'Wenig Luftaustausch', 'Am Morgen kaum Wind, belastete Luft bleibt in Bodennähe. Spaziergang lieber zu Mittag, Lüften eher später am Vormittag.');
  if(typeof inv.t2m === 'number'){
    if(inv.t2m < -5) add(sens ? 8 : 3, 'Eisige Luft', 'Früh ' + fmt(inv.t2m, 1) + ' °C. Schal locker vor Mund und Nase, durch die Nase atmen und ruhig starten.');
    else if(inv.t2m < 2 && sens) add(4, 'Kalte Luft', 'Früh ' + fmt(inv.t2m, 1) + ' °C. Vor Bewegung draußen gut aufwärmen und durch die Nase atmen.');
  }
  if(!items.length) add(1, 'Gute Luft', 'Die Luft macht es heute leicht' + (placeName ? ' in ' + placeName : '') + '. Ein guter Tag für Bewegung im Freien.');

  items.sort((a, b) => b.w - a.w);
  const ex = exerciseFor(pr);
  return {
    title: items[0].head,
    text: items.slice(0, 2).map(i => i.text).join(' '),
    level: items[0].w >= 7 ? 3 : items[0].w >= 4 ? 2 : 1,
    ex
  };
}

/** Kalenderwoche nach ISO 8601, z. B. "2026-W45". */
export function isoWeek(d = new Date()){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}

const GENERAL = [
  { title: 'Drei Minuten ruhig atmen', text: 'Vier Sekunden ein, sechs Sekunden aus: Langsames Atmen mit längerer Ausatmung wirkt für viele entspannend. Ideal als kurze Pause zwischendurch, die Anleitung findest du unter „Atmen“.' },
  { title: 'Richtig lüften', text: 'Mehrmals täglich fünf bis zehn Minuten Stoßlüften bringt mehr frische Luft als ein dauerhaft gekipptes Fenster. Bei trüber Talluft oder viel Pollen den Zeitpunkt nach der Atemwetter-Prognose wählen.' },
  { title: 'Durch die Nase atmen', text: 'Die Nase wärmt, befeuchtet und filtert die Luft. Gerade bei kühler Witterung und beim gemütlichen Gehen lohnt es sich, bewusst durch die Nase zu atmen.' },
  { title: 'Bewegung an der frischen Luft', text: 'Regelmäßige Bewegung im Freien tut Körper und Atmung gut. Wege abseits von Hauptstraßen und Zeiten mit guter Luft machen den Spaziergang noch angenehmer.' },
  { title: 'Gute Luft in Innenräumen', text: 'Kochen, Kerzen und Rauch belasten die Raumluft. Nach dem Kochen kurz lüften und in Wohnräumen nicht rauchen.' },
  { title: 'Eine bewusste Auszeit', text: 'Ein paar ruhige Atemzüge am offenen Fenster oder ein kurzer Spaziergang in der Mittagspause: Kleine Auszeiten im Alltag sind ein einfacher Beitrag zu deiner Gesundheit.' }
];

/**
 * Automatischer Tipp der Woche aus Daten und Jahreszeit.
 * @param days  die nächsten Tage eines Ortes
 * @param week  ISO-Woche (für die Abwechslung der allgemeinen Tipps)
 */
export function weeklyTip(days, placeName, week){
  days = days || [];
  const m = days[0] ? new Date(days[0].date + 'T12:00:00').getMonth() : new Date().getMonth();
  const inv = days.filter(d => d.inversion && d.inversion.level === 'stark').length;
  const bad = days.filter(d => d.aqi_max > 40).length;
  const cold = days.some(d => d.inversion && typeof d.inversion.t2m === 'number' && d.inversion.t2m < 0);
  const ozone = days.some(d => d.o3_max > 100);
  const where = placeName ? ' in ' + placeName : '';
  const peaks = SEASON.filter(P => P.pot === 3 && P.pk.includes(m) && P.g !== 3);
  const spores = SEASON.filter(P => P.g === 3 && P.pk.includes(m));
  if(bad >= 2 || inv >= 2) return { title: 'Trübe Talluft: klug lüften und bewegen', text: 'Diese Woche ist' + where + ' an mehreren Tagen wenig Luftaustausch oder mäßige Luft zu erwarten. Lüfte eher gegen Mittag, verlege Bewegung im Freien in die Tagesmitte und meide stark befahrene Straßen. Die Tageswerte findest du unter „Heute“.' };
  if(peaks.length) return { title: 'Hauptblüte im ' + MN[m] + ': ' + list(peaks.map(P => P.n)), text: 'Jetzt ist typischerweise Hauptblüte von ' + list(peaks.map(P => P.n)) + '. Wer darauf reagiert: abends Haare waschen, Kleidung nicht im Schlafzimmer ablegen und zu pollenarmen Zeiten lüften. Wähle deine Arten im Allergie-Check, dann bekommst du passende Tagestipps.' };
  if(ozone) return { title: 'Sommerluft: Sport am Vormittag', text: 'An sonnigen Tagen steigt Ozon bis zum Nachmittag an. Wer draußen Sport macht, legt ihn besser auf den Vormittag oder den Abend. Empfindliche Atemwege merken den Unterschied oft.' };
  if(cold) return { title: 'Kalte Luft: sanft starten', text: 'Diese Woche wird es' + where + ' am Morgen frostig. Kalte, trockene Luft reizt empfindliche Atemwege. Ein Schal locker vor Mund und Nase, ruhiges Aufwärmen und Atmen durch die Nase helfen vielen.' };
  if(spores.length) return { title: 'Schimmelpilzsporen im Sommer', text: 'Im Hochsommer sind besonders viele Schimmelpilzsporen wie Alternaria in der Luft, vor allem an warmen, trockenen und windigen Tagen. Wer darauf reagiert, meidet Erntearbeiten und frisch gemähte Wiesen.' };
  const n = parseInt(String(week || isoWeek()).slice(-2), 10) || 0;
  return GENERAL[n % GENERAL.length];
}
