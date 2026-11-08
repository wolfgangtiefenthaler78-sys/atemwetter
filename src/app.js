/* Atemwetter – Oberfläche. Daten und Speichern kommen über `api` (src/data.js). */
import qrcode from 'qrcode-generator';
import { POLLEN_NAMES, POLLEN_TH, LEVELS, pollenLevel, SEASON_GROUPS, SEASON, SEASON_BY, POT, MN, MS, phase } from './pollen.js';
import { dailyTip, weeklyTip, isoWeek, partnerLine } from './tips.js';
import { createNotifier, loadSettings, saveSettings, platform as notePlatform } from './notify.js';
export function startApp(D, api){
const $ = id => document.getElementById(id);
const STATE = D.state;
const AIR = D.air;
const PLACES = AIR.places || [{id:'dornbirn',name:AIR.place||'Dornbirn',region:'',elev:440,days:AIR.days||[]}];
const LS = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ v===null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch(e){} } };
let placeId = LS.get('aw-place') || AIR.default || PLACES[0].id;
if(!PLACES.some(p=>p.id===placeId)) placeId = AIR.default || PLACES[0].id;
let autoInfo = '';
const curPlace = () => PLACES.find(p=>p.id===placeId) || PLACES[0];
const curDays = () => curPlace().days || [];
window.__AW = { PLACES, STATE, curPlace: () => curPlace(), get placeId(){ return placeId; } };

/* ---------- Luftqualität ---------- */
const BANDS = [
  {max:20,  name:'Gut',            color:'var(--q1)', text:'Saubere Luft. Ein guter Tag für Bewegung draußen und zum Lüften.'},
  {max:40,  name:'Recht gut',      color:'var(--q2)', text:'Die Luft ist meist sauber. Für fast alle Menschen gibt es keine Einschränkungen.'},
  {max:60,  name:'Mäßig',          color:'var(--q3)', text:'Für die meisten Menschen kein Problem. Wer empfindliche Atemwege hat, strengt sich draußen besser kürzer an.'},
  {max:80,  name:'Schlecht',       color:'var(--q4)', text:'Die Luft ist belastet. Empfindliche Menschen strengen sich draußen weniger an. Lüften besser zu ruhigeren Zeiten.'},
  {max:100, name:'Sehr schlecht',  color:'var(--q5)', text:'Die Luft ist stark belastet. Anstrengung draußen möglichst meiden, vor allem mit einer Lungenkrankheit.'},
  {max:1e9, name:'Extrem schlecht',color:'var(--q6)', text:'Die Luft ist sehr stark belastet. Nur kurz ins Freie gehen.'}];
const band = v => BANDS.find(b => v <= b.max);
const fmt = (n,d=0) => Number(n).toLocaleString('de-AT',{minimumFractionDigits:d,maximumFractionDigits:d});
const dayName = iso => new Date(iso+'T12:00:00').toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long'});
const shortDay = iso => new Date(iso+'T12:00:00').toLocaleDateString('de-AT',{weekday:'short',day:'numeric',month:'numeric'});

function todayIndex(){
  const now = new Date();
  const iso = now.toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'});
  const i = curDays().findIndex(d => d.date === iso);
  return i < 0 ? 0 : i;
}

function renderToday(){
  const days = curDays();
  if(!days.length){ $('verdict').textContent='Keine Daten'; return; }
  const ti = todayIndex(), t = days[ti];
  const b = band(t.aqi_max);
  $('hero-date').textContent = curPlace().name + ' · ' + dayName(t.date) + (autoInfo ? ' · ' + autoInfo : '');
  $('place-label').textContent = curPlace().name;
  $('place-btn').setAttribute('aria-label','Ort: '+curPlace().name+(autoInfo?' (automatisch)':'')+' – ändern');
  $('verdict').textContent = b.name;
  $('aqi-dot').style.background = b.color;
  $('aqi-val').textContent = t.aqi_max;
  $('lede').textContent = b.text + ' Die Zahl ist der höchste Wert einer Stunde an diesem Tag.';
  $('scale-bar').innerHTML = BANDS.map(x => '<i style="background:'+x.color+'"></i>').join('');
  $('scale-marker').style.left = Math.min(100, t.aqi_max / 120 * 100) + '%';

  const P = [
    {k:'pm25', n:'Feinstaub PM2,5', s:'sehr feiner Staub · Durchschnitt des Tages · WHO-Richtwert 15', lim:15, u:'µg/m³'},
    {k:'pm10', n:'Feinstaub PM10',  s:'feiner Staub · Durchschnitt des Tages · WHO-Richtwert 45', lim:45, u:'µg/m³'},
    {k:'no2',  n:'Stickstoffdioxid',s:'vor allem aus Abgasen · Durchschnitt des Tages · WHO-Richtwert 25', lim:25, u:'µg/m³'},
    {k:'o3_max',n:'Ozon',           s:'höchste Stunde · WHO-Richtwert 100 (für 8 Stunden)', lim:100, u:'µg/m³'}];
  $('pollutants').innerHTML = P.map(p => {
    const v = t[p.k]; const pct = v / p.lim * 100;
    return '<div class="row"><div class="name"><b>'+p.n+'</b><small>'+p.s+'</small></div>'+
      '<div class="meter" role="img" aria-label="'+fmt(pct)+' Prozent des Richtwerts"><span class="'+(pct>100?'over':'')+'" style="width:'+Math.min(100,pct)+'%"></span></div>'+
      '<div class="val"><span class="num">'+fmt(v,1)+'</span> <small>'+p.u+'</small></div></div>';
  }).join('');

  const inv = t.inversion;
  const box = $('inv-box');
  box.hidden = !inv || inv.level === 'na';
  box.className = 'note inv-' + (inv ? inv.level : 'keine');
  const INV = {
    stark:'Am Morgen kaum Wind und feuchte Luft, oft mit Nebel. Abgase und Feinstaub bleiben dann am Boden, vor allem in Tälern. Geh besser zu Mittag ins Freie. Oder weiter hinauf, über den Nebel.',
    leicht:'Am Morgen wenig Wind. Die Luft wird nur wenig ausgetauscht. Lüfte besser zu Mittag als am frühen Morgen.',
    keine:'Am Morgen genug Wind. Die Luft wird gut ausgetauscht.'};
  $('h-inv').textContent = inv ? ({stark:'Kaum Luftaustausch',leicht:'Wenig Luftaustausch',keine:'Guter Luftaustausch'})[inv.level] || 'Luftaustausch' : 'Keine Angabe';
  $('inv-text').textContent = inv ? INV[inv.level] : 'Für heute gibt es keine Wetterdaten.';
  $('inv-num').textContent = !inv || inv.level==='na' ? '' : (typeof inv.wind==='number' ? '06–10 Uhr · Wind '+fmt(inv.wind,1)+' m/s · Luftfeuchte '+fmt(inv.rh)+' %' : '07:00 Uhr · '+fmt(inv.t2m,1)+' °C');

  const trueb = (inv && (inv.level==='stark' || inv.level==='leicht')) || t.aqi_max > 40;
  renderHint('heute', trueb ? (inv && inv.level==='stark' ? 'Bei trüber Talluft:' : 'Wenn die Luft draußen schwer wirkt:') : 'Für eine bewusste Pause:');
  const PN = POLLEN_NAMES;
  const lvl = (v,k) => { const L = pollenLevel(k,v); return [L.name, [0,25,60,100][L.i]]; };
  const pol = t.pollen || {};
  const active = Object.keys(PN).filter(k => (pol[k]||0) >= 1);
  $('pollen').innerHTML = t.pollen == null ? '<p class="muted" style="padding-top:10px">Für heute gibt es noch keine Pollenwerte. Den Blüh-Kalender und Tipps findest du im Allergie-Check.</p>' : active.length ? active.map(k => {
    const [l,w] = lvl(pol[k],k);
    return '<div class="row"><div class="name"><b>'+PN[k]+'</b><small>Tageshöchstwert</small></div><div class="meter"><span class="'+(l==='hoch'?'over':'')+'" style="width:'+w+'%"></span></div><div class="val"><span class="num">'+fmt(pol[k])+'</span> <small>Körner/m³ · '+l+'</small></div></div>';
  }).join('') : '<p class="muted" style="padding-top:10px">Heute fliegen laut Vorhersage kaum Pollen von Erle, Birke, Gräsern, Beifuß oder Ambrosia.</p>';

  renderSpark(t);
  $('days').innerHTML = days.map((d,i) => { const bb = band(d.aqi_max);
    return '<div class="day"><span class="d">'+(i===ti?'Heute':shortDay(d.date))+'</span><span class="q"><span class="dot" style="background:'+bb.color+'"></span>'+bb.name+'</span><span class="muted num" style="font-size:.85rem">Index '+d.aqi_max+(d.inversion&&d.inversion.level==='stark'?' · wenig Luftaustausch':d.inversion&&d.inversion.level==='leicht'?' · mäßiger Luftaustausch':'')+'</span></div>'; }).join('');

  $('f-stand').textContent = 'Ort: ' + curPlace().name + (curPlace().region?' ('+curPlace().region+')':'') + ' · Stand der Daten: ' + new Date(curPlace().updated || AIR.updated).toLocaleString('de-AT',{dateStyle:'medium',timeStyle:'short'});
}

function renderSpark(t){
  const v = t.aqi_hourly || []; if(!v.length){ $('spark').innerHTML=''; return; }
  const W=640,H=170,L=34,R=10,T=12,B=26, max=Math.max(80,...v.filter(x=>x!=null))+5;
  const x = i => L + i*(W-L-R)/(v.length-1), y = val => T + (1-val/max)*(H-T-B);
  const pts = v.map((val,i)=> val==null?null:[x(i),y(val)]).filter(Boolean);
  const line = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area = line+' L'+pts[pts.length-1][0].toFixed(1)+' '+(H-B)+' L'+pts[0][0].toFixed(1)+' '+(H-B)+' Z';
  const grid = [20,40,60,80].filter(g=>g<max).map(g=>'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(g)+'" y2="'+y(g)+'" stroke="var(--line)" stroke-width="1"/><text x="'+(L-6)+'" y="'+(y(g)+4)+'" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">'+g+'</text>').join('');
  const ticks = [0,6,12,18,23].map(h=>'<text x="'+x(h)+'" y="'+(H-8)+'" text-anchor="'+(h===23?'end':h===0?'start':'middle')+'" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">'+String(h).padStart(2,'0')+':00</text>').join('');
  let now = '';
  if(todayIndex()===curDays().indexOf(t)){
    const hr = Number(new Date().toLocaleString('en-GB',{timeZone:'Europe/Vienna',hour:'2-digit',hour12:false}))%24;
    if(v[hr]!=null) now = '<line x1="'+x(hr)+'" x2="'+x(hr)+'" y1="'+T+'" y2="'+(H-B)+'" stroke="var(--muted)" stroke-dasharray="3 3"/><circle cx="'+x(hr)+'" cy="'+y(v[hr])+'" r="5" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/><text x="'+Math.min(x(hr)+8,W-60)+'" y="'+(y(v[hr])-9)+'" font-size="12" fill="var(--ink)" font-family="IBM Plex Mono,monospace">jetzt '+v[hr]+'</text>';
  }
  $('spark').innerHTML = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Europäischer Luftqualitätsindex stündlich, heute"><g>'+grid+'</g><path d="'+area+'" fill="var(--accent-soft)"/><path d="'+line+'" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>'+now+ticks+'</svg>';
}

/* ---------- Pollen / Allergie ---------- */
let seasonAll = false;
let myAllergens = (LS.get('aw-allergens')||'').split(',').filter(k=>SEASON_BY[k]);  // Pollen- und Sporenarten aus dem Katalog
const myModel = () => myAllergens.filter(k=>POLLEN_NAMES[k]);                     // davon mit Copernicus-Tageswerten
let seasonSel = null;  // vom Nutzer gewählter Monat (Schieberegler); null = aktueller Monat
let seasonOpen = null; // aufgeklappte Pollenart
function seasonDetail(P, selM, isNow){
  const id = 'sd-'+P.id;
  const ph = phase(P, selM), pkTxt = P.pk.map(m=>MN[m]).join(' und ');
  const strip = MS.map((x,i)=>'<span class="ph ph'+phase(P,i)+(i===selM?' sel':'')+'"></span>').join('');
  const axis = MS.map((x,i)=>'<span'+(i===selM?' class="sel"':'')+'>'+x[0]+'</span>').join('');
  const mon = isNow ? 'jetzt im '+MN[selM] : 'im '+MN[selM];
  let box;
  if(ph===2) box = '<div class="sd-box w2"><b>Warnung: '+(P.g===3?'Hauptsaison ':'Hauptblüte ')+mon+'</b><span>'+(isNow?'Jetzt':'In dieser Zeit')+' fliegen die meisten '+P.pn+'. Zeit draußen gut planen. Tagsüber kurz und kräftig lüften. Deine Medikamente bereithalten.</span></div>';
  else if(ph===1){ const before = selM < P.pk[0]; box = '<div class="sd-box w1"><b>Aktiv: '+P.n+' fliegt '+mon+'</b><span>'+(before ? 'Die Saison beginnt. Am stärksten wird es meist im '+pkTxt+'.' : 'Die stärkste Zeit ist vorbei. Es fliegen langsam weniger Pollen.')+'</span></div>'; }
  else { const nx = (P.ms[0]-selM+12)%12; box = '<div class="sd-box w0"><b>Ruht '+mon+'</b><span>Die Saison beginnt meist im '+MN[P.ms[0]]+(nx?' (in '+nx+' Monat'+(nx>1?'en':'')+')':'')+'. Am stärksten im '+pkTxt+'.</span></div>'; }
  let today = '';
  if(isNow){
    if(P.k){ const d = curDays()[todayIndex()] || {}, v = (d.pollen||{})[P.k]||0, L = pollenLevel(P.k, v);
      today = '<p class="sd-today"><span class="dot" style="background:'+L.c+'"></span>Heute in '+curPlace().name+' laut Modell: <b>'+L.name+'</b>'+(v>=1?' <span class="num muted">('+fmt(v)+' Körner/m³)</span>':'')+'</p>'; }
    else today = '<p class="sd-today muted">Für '+P.n+' gibt es keine Tageswerte. Atemwetter zeigt nur die übliche Blütezeit.</p>';
  }
  return '<div class="sd" id="'+id+'">'+
    '<div class="sd-strip" aria-hidden="true">'+strip+'</div><div class="sd-axis" aria-hidden="true">'+axis+'</div>'+
    '<div class="sd-legend" aria-hidden="true"><span><i class="ph ph0"></i>ruht</span><span><i class="ph ph1"></i>fliegt</span><span><i class="ph ph2"></i>Hauptblüte</span></div>'+
    '<p class="sd-pot">Löst Allergien aus: <b>'+['','selten','manchmal','oft'][P.pot]+'</b>'+(P.g===3?' · Pilzsporen':'')+'</p>' + box + today + (P.note?'<p class="muted sd-note">'+P.note+'</p>':'') + '</div>';
}
function renderSeason(nowMonth){
  // Saisonkalender als einfache Liste mit Monats-Schieberegler; Antippen einer Pollenart klappt die Jahresübersicht auf
  const nowM = nowMonth, selM = seasonSel==null ? nowM : seasonSel, isNow = selM===nowM;
  const pool = myAllergens.length && !seasonAll ? SEASON.filter(P=>myAllergens.includes(P.id)) : SEASON;
  const selOnly = myAllergens.length && !seasonAll;
  const flying = pool.filter(P=>P.ms.includes(selM) && (selOnly || P.pot>=2)).map(P=>P.n);
  $('al-month').value = selM;
  $('al-month').setAttribute('aria-valuetext', MN[selM] + (isNow?' (jetzt)':''));
  $('al-month-out').innerHTML = '<b>'+MN[selM]+'</b>'+(isNow?' · jetzt':'')+'<br><small>'+(flying.length ? (selOnly?'Es fliegen: ':'Wichtig: ')+flying.join(', ') : (selOnly?'Keine deiner Arten in Saison':'Kaum Pollen in der Luft'))+'</small>';
  $('al-month-now').hidden = isNow;
  const mine = myAllergens.length && !seasonAll;
  $('al-sfilter').hidden = !myAllergens.length;
  $('al-sfilter').querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed', String((c.dataset.f==='all')===!mine)));
  const list = SEASON.filter(P=>!mine || myAllergens.includes(P.id));
  const row = P=>{
    const a = P.ms[0], e = P.ms[P.ms.length-1], ph = phase(P, selM), open = seasonOpen===P.id;
    const nextIn = (a - selM + 12) % 12;
    const st = ph===2 ? [P.g===3?'Hauptsaison':'Hauptblüte','peak'] : ph===1 ? [isNow?'fliegt jetzt':'fliegt','on'] : nextIn > 0 && nextIn <= 2 ? ['ab '+MN[a],'soon'] : ['ruht','off'];
    const bar = MS.map((x,i)=>'<span class="cell'+(P.ms.includes(i)?' on':'')+(i===selM?' now':'')+'"></span>').join('');
    return '<div class="s-row'+(ph?' active':'')+(open?' open':'')+'"><button type="button" class="s-btn" data-n="'+P.id+'" aria-expanded="'+open+'"'+(open?' aria-controls="sd-'+P.id+'"':'')+'>'+
      '<span class="s-head"><b>'+P.n+'</b>'+(P.k?' <span class="tag tag-v">Vorhersage</span>':'')+'<span class="s-per">'+MS[a]+' – '+MS[e]+'</span><span class="s-right"><span class="s-st '+st[1]+'">'+st[0]+'</span><span class="s-chev" aria-hidden="true"></span></span></span>'+
      '<span class="s-bar" aria-hidden="true">'+bar+'</span></button>'+(open ? seasonDetail(P, selM, isNow) : '')+'</div>';
  };
  $('al-season').innerHTML = SEASON_GROUPS.map((g,gi)=>{ const L = list.filter(P=>P.g===gi); return L.length ? '<div class="s-group eyebrow">'+g+'</div>'+L.map(row).join('') : ''; }).join('') +
    '<div class="s-axis" aria-hidden="true">'+MS.map((x,i)=>'<span'+(i===selM?' class="now"':'')+'>'+x[0]+'</span>').join('')+'</div>';
}
$('al-sfilter').addEventListener('click', e=>{ const c=e.target.closest('.chip'); if(!c) return; seasonAll = c.dataset.f==='all'; renderSeason(new Date().getMonth()); });
$('al-season').addEventListener('click', e=>{ const b = e.target.closest('.s-btn'); if(!b) return;
  seasonOpen = seasonOpen===b.dataset.n ? null : b.dataset.n; renderSeason(new Date().getMonth());
  const nb = document.querySelector('#al-season .s-btn[data-n="'+b.dataset.n+'"]'); if(nb) nb.focus(); });
$('al-month').addEventListener('input', e=>{ seasonSel = Number(e.target.value); renderSeason(new Date().getMonth()); });
$('al-month-now').addEventListener('click', ()=>{ seasonSel = null; renderSeason(new Date().getMonth()); $('al-month').focus(); });
// Tabelle „Die nächsten drei Tage“: Arten mit Copernicus-Tageswerten (Modell) und – aus der Auswahl – Arten nach Blühkalender
function renderPollenTable(days, ti, modelKeys){
  const calRows = (myAllergens.length ? myAllergens.map(k=>SEASON_BY[k]).filter(P=>!P.k)
    : SEASON.filter(P=>!P.k && P.pot>=2 && days.some(d=>P.ms.includes(new Date(d.date+'T12:00:00').getMonth()))));
  const hasModel = days.some(d=>d.pollen) && modelKeys.length;
  const CAL = [['ruht','var(--q1)'],['Saison','var(--q3)'],['Hauptblüte','var(--q4)']];
  const head = '<thead><tr><th>Art</th>'+days.map((d,i)=>'<th>'+(i===ti?'Heute':shortDay(d.date))+'</th>').join('')+'</tr></thead>';
  const mRows = hasModel ? modelKeys.map(k=>'<tr><td><b>'+POLLEN_NAMES[k]+'</b> <span class="tag tag-v">Vorhersage</span></td>'+days.map(d=>{ const v=(d.pollen||{})[k]||0, L=pollenLevel(k,v); return '<td><span class="lv"><span class="dot" style="background:'+L.c+'"></span>'+L.name+(v>=1?' <span class="num muted" style="font-size:.82rem">'+fmt(v)+'</span>':'')+'</span></td>'; }).join('')+'</tr>').join('') : '';
  const cRows = calRows.map(P=>'<tr><td><b>'+P.n+'</b> <span class="tag">Kalender</span></td>'+days.map(d=>{ const c=CAL[phase(P, new Date(d.date+'T12:00:00').getMonth())]; return '<td><span class="lv"><span class="dot" style="background:'+c[1]+'"></span>'+c[0]+'</span></td>'; }).join('')+'</tr>').join('');
  $('al-table').innerHTML = head+'<tbody>'+mRows+cRows+'</tbody>';
  $('al-days-sec').hidden = !(mRows || cRows);
}
function renderAllergy(){
  const days = curDays(); if(!days.length) return;
  const ti = todayIndex(), t = days[ti];
  const sel = myModel();
  const keys = myAllergens.length ? sel : Object.keys(POLLEN_NAMES);   // Arten mit Tageswerten
  $('al-chips').innerHTML = SEASON_GROUPS.map((g,gi)=>'<div class="al-group"><div class="eyebrow">'+g+'</div><div class="chips">'+
    SEASON.filter(P=>P.g===gi).map(P=>'<button class="chip" type="button" data-k="'+P.id+'" aria-pressed="'+myAllergens.includes(P.id)+'">'+P.n+(P.k?' <span class="tag tag-v">Vorhersage</span>':'')+'</button>').join('')+'</div></div>').join('');
  const nowM = new Date().getMonth();
  const calSel = (myAllergens.length ? myAllergens.map(k=>SEASON_BY[k]) : SEASON.filter(P=>P.pot>=2)).filter(P=>!P.k);
  const calNow = calSel.filter(P=>P.ms.includes(nowM)), calPeak = calNow.filter(P=>P.pk.includes(nowM));
  const calTxt = calNow.length ? ' Laut Kalender '+(myAllergens.length?'außerdem ':'')+'in Saison: '+calNow.map(P=>P.n+(P.pk.includes(nowM)?' (Hauptblüte)':'')).join(', ')+'.' : '';
  const pillTxt = myAllergens.length ? 'Deine Auswahl: ' + myAllergens.length + (myAllergens.length===1?' Art':' Arten') : 'Alle Pollenarten';
  if(t.pollen == null || !keys.length){
    const inSeason = (myAllergens.length ? myAllergens.map(k=>SEASON_BY[k]) : SEASON.filter(P=>P.pot>=2)).filter(P=>P.ms.includes(nowM));
    const peak = inSeason.filter(P=>P.pk.includes(nowM));
    $('al-date').textContent = 'Pollen-Check · ' + curPlace().name + ' · ' + dayName(t.date);
    $('al-verdict').textContent = peak.length ? 'Hauptblüte' : inSeason.length ? 'Blütezeit läuft' : 'Außerhalb der Blütezeit';
    $('al-dot').style.background = peak.length ? 'var(--q4)' : inSeason.length ? 'var(--q3)' : 'var(--q1)';
    $('al-pill').textContent = pillTxt;
    $('al-lede').textContent = inSeason.length
      ? 'Laut Kalender ist jetzt meist Saison für ' + inSeason.map(P=>P.n+(P.pk.includes(nowM)?' (Hauptblüte)':'')).join(', ') + '.' + (t.pollen == null ? ' Tageswerte gibt es beim Österreichischen Pollenwarndienst.' : '')
      : 'Für ' + (myAllergens.length ? 'deine Auswahl' : 'die wichtigsten Pollenarten') + ' ist laut Kalender gerade keine Saison. In der Heizzeit stören eher Hausstaub-Milben oder Schimmel in der Wohnung.';
    renderPollenTable(days, ti, []);
    $('al-times-text').textContent = 'In der Pollenzeit kurz und kräftig lüften. Nach Regen sind oft weniger Pollen in der Luft. Feinstaub und Luftaustausch findest du unter „Heute“.';
    renderSeason(nowM);
    renderHint('allergie', 'Zum Abschalten zwischendurch:');
    return;
  }
  const lv = keys.map(k=>({k, v:(t.pollen||{})[k]||0, L:pollenLevel(k,(t.pollen||{})[k])})).sort((a,b)=>b.L.i-a.L.i||b.v-a.v);
  const worst = lv[0].L;
  const V = ['Pollenfreier Tag','Geringe Belastung','Mäßige Belastung','Hohe Belastung'];
  const LED = ['Laut Vorhersage fliegen heute kaum Pollen'+(myAllergens.length?' deiner Arten':'')+'. ',
    'Es fliegen einzelne Pollen. Sehr empfindliche Menschen spüren vielleicht leichte Beschwerden.',
    'Es fliegen spürbar viele Pollen. Mit Allergie: Zeit draußen gut planen und die Medikamente bereithalten.',
    'Es fliegen sehr viele Pollen. Nur kurz ins Freie gehen. Fenster tagsüber eher geschlossen lassen.'];
  const m = new Date(t.date+'T12:00:00').getMonth();
  const offSeason = worst.i===0 && (m>=9 || m<=0);
  $('al-date').textContent = 'Pollen-Check · ' + curPlace().name + ' · ' + dayName(t.date);
  $('al-verdict').textContent = V[worst.i]; $('al-dot').style.background = worst.c;
  $('al-pill').textContent = pillTxt;
  $('al-lede').textContent = (LED[worst.i].trim() + calTxt + (offSeason && !calNow.length ? ' Die Pollen-Saison ruht gerade. In der Heizzeit stören eher Hausstaub-Milben oder Schimmel in der Wohnung.' : '')).trim();
  renderPollenTable(days, ti, keys);
  // beste Lüftzeit aus Stundenwerten
  const ph = t.pollen_hourly || {};
  const active = keys.filter(k=>ph[k]);
  let txt;
  if(!active.length){ txt = 'Heute stören keine Pollen. Lüften und Rausgehen geht jederzeit. Feinstaub und Luftaustausch findest du unter „Heute“.'; }
  else {
    const sum = h => active.reduce((a,k)=>a+(ph[k][h]||0),0);
    let lo=6, hi=6; for(let h=6; h<=21; h++){ if(sum(h)<sum(lo)) lo=h; if(sum(h)>sum(hi)) hi=h; }
    txt = 'Laut Vorhersage fliegen heute gegen '+String(lo).padStart(2,'0')+':00 Uhr am wenigsten Pollen. Dann ist ein guter Zeitpunkt zum Lüften. Die meisten Pollen fliegen gegen '+String(hi).padStart(2,'0')+':00 Uhr. Dann besser drinnen bleiben.';
  }
  $('al-times-text').textContent = txt;
  renderHint('allergie', 'Zum Abschalten zwischendurch:');
  renderSeason(new Date().getMonth());
}
$('al-chips').addEventListener('click', e=>{ const b=e.target.closest('.chip'); if(!b) return; const k=b.dataset.k;
  myAllergens = myAllergens.includes(k) ? myAllergens.filter(x=>x!==k) : myAllergens.concat(k);
  LS.set('aw-allergens', myAllergens.length ? myAllergens.join(',') : null); renderAllergy(); renderAsthma(); renderDailyTip(); refreshNotes(); });
$('to-allergie').addEventListener('click', ()=>{ location.hash='allergie'; show('allergie'); window.scrollTo(0,0); });

/* ---------- COPD ---------- */
function renderCopd(){
  const days = curDays(); if(!days.length) return;
  const t = days[todayIndex()], inv = t.inversion || {};
  const F = [];
  const add = (lvl, name, val, tip) => F.push({lvl, name, val, tip});
  if(t.aqi_max > 60) add(2,'Luftqualität insgesamt','Index '+t.aqi_max,'Heute draußen weniger anstrengen. Spaziergänge kurz halten.');
  else if(t.aqi_max > 40) add(1,'Luftqualität insgesamt','Index '+t.aqi_max,'Längere Wege draußen besser zu Mittag.');
  else add(0,'Luftqualität insgesamt','Index '+t.aqi_max,'Gut für Bewegung im Freien.');
  if(t.pm25 > 25) add(2,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Deutlich über dem WHO-Richtwert. Nicht an stark befahrenen Straßen gehen.');
  else if(t.pm25 > 15 || t.pm10 > 45) add(1,'Feinstaub',fmt(t.pm25,1)+' µg/m³ PM2,5','Über dem WHO-Richtwert. Große Straßen meiden. Zu ruhigen Zeiten lüften.');
  else add(0,'Feinstaub',fmt(t.pm25,1)+' µg/m³ PM2,5','Unter dem WHO-Richtwert.');
  if(t.no2 > 25) add(1,'Stickstoffdioxid',fmt(t.no2,1)+' µg/m³','Kommt vor allem von Autos. Wege abseits großer Straßen wählen.');
  if(inv.level==='stark') add(1,'Wenig Luftaustausch','am Morgen','Kaum Wind. Am Morgen bleibt schlechte Luft am Boden. Besser zu Mittag hinausgehen.');
  if(typeof inv.t2m === 'number'){
    if(inv.t2m < -5) add(2,'Kalte Luft',fmt(inv.t2m,1)+' °C früh','Eisige Luft ist für viele anstrengend. Schal locker vor Mund und Nase. Durch die Nase atmen, langsam gehen.');
    else if(inv.t2m < 2) add(1,'Kühle Luft',fmt(inv.t2m,1)+' °C früh','Bei kalter Luft hilft vielen ein Schal vor Mund und Nase. Langsam starten.');
  }
  const worst = Math.max(...F.map(f=>f.lvl));
  const V = [
    {n:'Ruhiger Tag', c:'var(--q2)', l:'Die Luft macht es heute leicht. Ein guter Tag für Bewegung, gern auch etwas länger.'},
    {n:'Achtsam', c:'var(--q3)', l:'Heute draußen etwas ruhiger machen. Bewegung bleibt wichtig, nur in kleineren Portionen.'},
    {n:'Vorsicht', c:'var(--q4)', l:'Heute ist die Luft für empfindliche Atemwege belastet. Bewegung lieber drinnen oder kurz und langsam. Notfallspray griffbereit halten.'}][worst];
  $('copd-date').textContent = 'Mit COPD · ' + curPlace().name + ' · ' + dayName(t.date);
  $('copd-verdict').textContent = V.n; $('copd-dot').style.background = V.c; $('copd-lede').textContent = V.l;
  $('copd-pill').textContent = F.filter(f=>f.lvl>0).length ? F.filter(f=>f.lvl>0).length + ' Faktor' + (F.filter(f=>f.lvl>0).length>1?'en':'') + ' zu beachten' : 'Nichts Besonderes zu beachten';
  const LC = ['var(--q2)','var(--q3)','var(--q4)'];
  $('copd-factors').innerHTML = F.sort((a,b)=>b.lvl-a.lvl).map(f=>'<div class="row" style="grid-template-columns:auto minmax(0,1fr) auto"><span class="dot" style="background:'+LC[f.lvl]+'"></span><div class="name"><b>'+f.name+'</b><small>'+f.tip+'</small></div><div class="val num">'+f.val+'</div></div>').join('');
  const POS = [
    ['Kutschersitz','Im Sitzen leicht nach vorn beugen. Unterarme auf die Oberschenkel stützen. Schultern locker lassen.'],
    ['Torwartstellung','Im Stehen die Knie leicht beugen. Hände über den Knien abstützen. Oberkörper leicht nach vorn.'],
    ['Wandstellung','Mit Po und Rücken an die Wand lehnen. Füße eine Fußlänge nach vorn. Arme hängen lassen.']];
  renderHint('copd', 'Eine ruhige Pause vom Alltag:');
  $('copd-pos').innerHTML = POS.map(p=>'<div class="day"><span class="d">'+p[0]+'</span><span class="muted" style="font-size:.92rem">'+p[1]+'</span></div>').join('');
}
$('copd-to-lippen').addEventListener('click', ()=>{ cur = EX.find(e=>e.id==='lippen'); renderEx(); location.hash='atmen'; show('atmen'); window.scrollTo(0,0); });

/* ---------- Asthma ---------- */
function renderAsthma(){
  const days = curDays(); if(!days.length) return;
  const t = days[todayIndex()], inv = t.inversion || {};
  const F = [];
  const add = (lvl, name, val, tip) => F.push({lvl, name, val, tip});
  if(t.aqi_max > 60) add(2,'Luftqualität insgesamt','Index '+t.aqi_max,'Heute draußen weniger anstrengen. Notfallspray griffbereit halten.');
  else if(t.aqi_max > 40) add(1,'Luftqualität insgesamt','Index '+t.aqi_max,'Längere Wege draußen in kleinen Portionen.');
  else add(0,'Luftqualität insgesamt','Index '+t.aqi_max,'Gut für Bewegung im Freien.');
  if(typeof t.o3_max === 'number'){
    if(t.o3_max > 140) add(2,'Ozon',fmt(t.o3_max)+' µg/m³ Spitze','Viel Ozon. Sport am Vormittag machen oder drinnen.');
    else if(t.o3_max > 100) add(1,'Ozon',fmt(t.o3_max)+' µg/m³ Spitze','Über dem WHO-Richtwert. Anstrengung draußen besser am Vormittag.');
  }
  if(t.pm25 > 25) add(2,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Deutlich über dem WHO-Richtwert. Nicht an stark befahrenen Straßen gehen.');
  else if(t.pm25 > 15) add(1,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Über dem WHO-Richtwert. Große Straßen meiden. Zu ruhigen Zeiten lüften.');
  else add(0,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Unter dem WHO-Richtwert.');
  if(t.no2 > 25) add(1,'Stickstoffdioxid',fmt(t.no2,1)+' µg/m³','Kommt vor allem von Autos. Wege abseits großer Straßen wählen.');
  const keys = myAllergens.length ? myModel() : Object.keys(POLLEN_NAMES);
  let pw = {i:0, k:null, v:0};
  keys.forEach(k=>{ const v=(t.pollen||{})[k]||0, L=pollenLevel(k,v); if(L.i>pw.i) pw={i:L.i, k, v}; });
  if(pw.i>=3) add(2,'Pollen: '+POLLEN_NAMES[pw.k],'hoch','Bei Asthma mit Allergie ein starker Auslöser. Nur kurz hinaus. Danach Gesicht und Haare waschen.');
  else if(pw.i===2) add(1,'Pollen: '+POLLEN_NAMES[pw.k],'mäßig','Bei Asthma mit Allergie spürbar. Lüften, wenn wenig Pollen fliegen (siehe Allergie-Check).');
  else add(0,'Pollen', pw.i ? 'gering' : 'keine','Laut Vorhersage fliegen heute kaum Pollen'+(myAllergens.length?' deiner Arten':'')+'.');
  { const m = new Date().getMonth(), cal = myAllergens.map(k=>SEASON_BY[k]).filter(P=>!P.k && P.pot>=2 && P.pk.includes(m));
    if(cal.length) add(1,'Laut Kalender: '+cal.map(P=>P.n).join(', '),'Hauptblüte','Für diese Arten gibt es keine Tageswerte. Achte jetzt besonders auf Beschwerden.'); }
  if(typeof inv.t2m === 'number'){
    if(inv.t2m < -5) add(2,'Kalte Luft',fmt(inv.t2m,1)+' °C früh','Kalte, trockene Luft kann die Atemwege eng machen. Schal vor Mund und Nase. Ruhig aufwärmen, langsam gehen.');
    else if(inv.t2m < 2) add(1,'Kühle Luft',fmt(inv.t2m,1)+' °C früh','Vor Bewegung draußen gut aufwärmen. Durch die Nase atmen.');
  }
  if(inv.level==='stark') add(1,'Wenig Luftaustausch','am Morgen','Kaum Wind. Am Morgen bleibt schlechte Luft am Boden. Besser zu Mittag hinausgehen.');
  const worst = Math.max(...F.map(f=>f.lvl));
  const V = [
    {n:'Ruhiger Tag', c:'var(--q2)', l:'Die Luft macht es heute leicht. Ein guter Tag für Bewegung im Freien. Das Notfallspray trotzdem mitnehmen.'},
    {n:'Achtsam', c:'var(--q3)', l:'Heute gibt es ein paar Auslöser. Bewegung bleibt wichtig: lieber kürzer und gut aufgewärmt.'},
    {n:'Vorsicht', c:'var(--q4)', l:'Heute gibt es starke Auslöser. Draußen nur kurz anstrengen. Notfallspray griffbereit, auf Warnzeichen achten.'}][worst];
  const n = F.filter(f=>f.lvl>0).length;
  $('as-date').textContent = 'Mit Asthma · ' + curPlace().name + ' · ' + dayName(t.date);
  $('as-verdict').textContent = V.n; $('as-dot').style.background = V.c; $('as-lede').textContent = V.l;
  $('as-pill').textContent = n ? n + ' Auslöser zu beachten' : 'Nichts Besonderes zu beachten';
  const LC = ['var(--q2)','var(--q3)','var(--q4)'];
  $('as-factors').innerHTML = F.sort((a,b)=>b.lvl-a.lvl).map(f=>'<div class="row" style="grid-template-columns:auto minmax(0,1fr) auto"><span class="dot" style="background:'+LC[f.lvl]+'"></span><div class="name"><b>'+f.name+'</b><small>'+f.tip+'</small></div><div class="val num">'+f.val+'</div></div>').join('');
  renderHint('asthma', 'Eine ruhige Pause vom Alltag:');
}
$('as-to-bauch').addEventListener('click', ()=>{ cur = EX.find(e=>e.id==='bauch'); renderEx(); location.hash='atmen'; show('atmen'); window.scrollTo(0,0); });
$('as-to-allergie').addEventListener('click', ()=>{ location.hash='allergie'; show('allergie'); window.scrollTo(0,0); });

/* ---------- Inhalte ---------- */
function renderContent(){
  const tip = STATE.tip || {}, p = STATE.partner || {};
  if(tip.auto || (!tip.title && !tip.text)){
    // automatisch: je Woche und Ort einmal gewählt und auf dem Gerät gemerkt, damit er die ganze Woche gleich bleibt
    const wk = isoWeek(), key = 'aw-wtip:' + wk + ':' + placeId;
    let w = null; try { w = JSON.parse(LS.get(key) || 'null'); } catch(e){}
    if(!w || !w.title){ w = weeklyTip(curDays(), curPlace().name, wk); LS.set(key, JSON.stringify(w)); }
    $('tip-eyebrow').textContent = 'Tipp der Woche · automatisch für ' + curPlace().name;
    $('tip-title').textContent = w.title; $('tip-text').textContent = w.text;
  } else {
    $('tip-eyebrow').textContent = 'Tipp der Woche';
    $('tip-title').textContent = tip.title || '';
    $('tip-text').textContent = tip.text || '';
  }
  $('p-name').textContent = p.name ? 'Partner-Angebot · ' + p.name : 'Partner-Angebot';
  $('p-head').textContent = p.headline || '';
  $('p-logo').hidden = !/mayoka/i.test(p.name || '');
  $('p-text').textContent = p.text || '';
  $('p-codebox').hidden = !p.code;
  $('p-code').textContent = p.code || '';
  $('p-note').textContent = p.note || '';
  $('p-contact').textContent = p.contact || '';
  const okUrl = /^https:\/\/\S+$/.test(p.url||'');
  const okBook = /^https:\/\/\S+$/.test(p.booking||''), short = p.name ? p.name.split(' ')[0] : '';
  const ctas = $('p-ctas'); ctas.innerHTML = '';
  const mk = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  if(okBook){ const a = mk('a','btn','Termin buchen'); a.href = p.booking; a.target = '_blank'; a.rel = 'noopener'; ctas.appendChild(a); }
  if(okUrl){ const a = mk('a', okBook ? 'btn ghost' : 'btn', short ? 'Zur Website von ' + short : 'Zur Website'); a.href = p.url; a.target = '_blank'; a.rel = 'noopener'; ctas.appendChild(a); }
  if(p.phone){ const w = mk('span','phone',''); const n = mk('span','num',p.phone); const b = mk('button','btn small ghost','Nummer kopieren'); b.type='button';
    b.addEventListener('click', ()=>copyText(p.phone, b, n)); w.append(n, b); ctas.appendChild(w); }
  ctas.hidden = !ctas.children.length;
  const fa = $('foot-actions'); fa.innerHTML = '';
  if(/^https:\/\/\S+$/.test(STATE.appLink||'')){ const b = mk('button','linkish','Link zur App kopieren und weiterempfehlen'); b.type='button'; b.addEventListener('click', ()=> (window.__AWNative && window.__AWNative.share) ? window.__AWNative.share(STATE.appLink) : copyText(STATE.appLink, b, null, 'Link kopiert – danke fürs Weitersagen')); fa.appendChild(b); }
  if(p.name){ const b = mk('button','linkish','Kontakt ' + (short||'Partner')); b.type='button'; b.addEventListener('click', goPartner); fa.appendChild(b); }
}
$('p-copy').addEventListener('click', async () => {
  const code = $('p-code').textContent;
  try { await navigator.clipboard.writeText(code); $('p-copy').textContent = 'Kopiert'; }
  catch(e){ const r=document.createRange(); r.selectNodeContents($('p-code')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); $('p-copy').textContent='Markiert'; }
  setTimeout(()=>$('p-copy').textContent='Kopieren',1800);
});

/* ---------- Dezente Hinweise ---------- */
function todayKey(){ return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'}); }
function copyText(text, btn, sel, done){
  const old = btn.textContent;
  const ok = () => { btn.textContent = done || 'Kopiert'; setTimeout(()=>btn.textContent = old, 2200); };
  try { navigator.clipboard.writeText(text).then(ok, ()=>fallback()); } catch(e){ fallback(); }
  function fallback(){ if(sel){ const r=document.createRange(); r.selectNodeContents(sel); const s=getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent='Markiert'; setTimeout(()=>btn.textContent=old,2200); } else { btn.textContent = text; } }
}
function goPartner(){ location.hash='heute'; show('heute'); const el = document.querySelector('.partner'); if(el) el.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'}); }
function renderHint(where, lead){
  const box = $('hint-'+where), p = STATE.partner || {};
  const on = p.showHints !== false && p.name && (p.hint || p.headline);
  if(!on || LS.get('aw-hint-'+where) === todayKey()){ box.hidden = true; return; }
  box.innerHTML = '';
  const tag = document.createElement('span'); tag.className='eyebrow'; tag.style.width='100%'; tag.textContent = 'Partner-Angebot · ' + p.name;
  const l = document.createElement('span'); l.className='lead'; l.textContent = lead;
  const t = document.createElement('span'); t.textContent = p.hint || p.headline;
  const go = document.createElement('button'); go.type='button'; go.className='linkish'; go.textContent='Mehr erfahren'; go.addEventListener('click', goPartner);
  const x = document.createElement('button'); x.type='button'; x.className='x'; x.setAttribute('aria-label','Hinweis für heute ausblenden'); x.textContent='×';
  x.addEventListener('click', ()=>{ LS.set('aw-hint-'+where, todayKey()); box.hidden = true; });
  box.append(tag, l, t, go, x);
  if(where==='copd' || where==='asthma' || where==='allergie'){ const n=document.createElement('small'); n.className='muted'; n.style.width='100%'; n.textContent='Ein Longevity- und Wellness-Angebot für deine Auszeit, kein Ersatz für ärztliche Behandlung.'; box.appendChild(n); }
  box.hidden = false;
}

/* ---------- Ansichten ---------- */
function show(view){
  if(!['atmen','copd','asthma','allergie'].includes(view)) view='heute';
  $('v-heute').hidden = view!=='heute'; $('v-atmen').hidden = view!=='atmen'; $('v-copd').hidden = view!=='copd'; $('v-asthma').hidden = view!=='asthma'; $('v-allergie').hidden = view!=='allergie';
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.view===view)));
  if(view!=='atmen') stopBreath();
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>{ location.hash = b.dataset.view; show(b.dataset.view); }));
window.addEventListener('hashchange',()=>show(location.hash.slice(1)));

/* ---------- Atemübungen ---------- */
const EX = [
  {id:'ruhig', name:'Ruhige Atmung', short:'Ruhig 4–6',
   desc:'Langsam atmen, etwa 6 Atemzüge pro Minute. Das Ausatmen dauert länger als das Einatmen.',
   steps:['Aufrecht und bequem sitzen. Schultern locker.','4 Sekunden ruhig durch die Nase einatmen.','6 Sekunden langsam ausatmen.','Nicht tiefer atmen als angenehm, nur langsamer.'],
   phases:[['Einatmen',4,1],['Ausatmen',6,.55]],
   level:'Übersicht kleiner Studien · Gesunde',
   ev:'Forschende haben 15 kleine Studien mit gesunden Menschen zusammengefasst. Wer langsamer als 10-mal pro Minute atmete, fühlte sich entspannter. Auch der Herzschlag passte sich besser an. Das ist ein Zeichen für Entspannung. Die Studien sind klein und unterschiedlich gemacht. Über Krankheiten sagen sie nichts.',
   src:[['Zaccaro et al. 2018, Frontiers in Human Neuroscience','10.3389/fnhum.2018.00353']]},
  {id:'lippen', name:'Lippenbremse', short:'Lippenbremse',
   desc:'Durch die Nase ein. Durch locker geschlossene Lippen doppelt so lange aus. Eine bekannte Übung aus der Atemtherapie.',
   steps:['2 Sekunden durch die Nase einatmen.','Lippen locker aufeinanderlegen. Als wolltest du eine Kerze sanft flackern lassen.','4 Sekunden durch die fast geschlossenen Lippen ausatmen.','Nicht pressen. Das Ausatmen bleibt leicht.'],
   phases:[['Einatmen',2,1],['Ausatmen',4,.55]],
   level:'Cochrane-Übersicht · COPD',
   ev:'Eine Cochrane-Übersicht ist eine besonders sorgfältige Zusammenfassung vieler Studien. Diese hier fasst 16 Studien mit 1.233 Menschen mit COPD zusammen. Sie machten 4 bis 15 Wochen lang Atemübungen. Danach konnten sie weiter gehen. Das wurde mit einem Geh-Test gemessen: Wie weit kommt man in 6 Minuten? Für die Lippenbremse allein zeigt das aber nur 1 Studie. Bei Atemnot und Lebensqualität war kein klarer Effekt zu sehen. Nebenwirkungen gab es keine.',
   src:[['Holland et al. 2012, Cochrane Database of Systematic Reviews','10.1002/14651858.CD008250.pub2']]},
  {id:'bauch', name:'Bauchatmung', short:'Bauchatmung',
   desc:'Du atmest in den Bauch statt in die Brust. Eine Hand liegt auf dem Bauch, eine auf der Brust.',
   steps:['Eine Hand auf den Bauch, eine auf die Brust legen.','3 Sekunden durch die Nase einatmen. Die Hand am Bauch hebt sich. Die Hand auf der Brust bleibt fast ruhig.','4 Sekunden entspannt ausatmen.','Mit der Zeit darf das Ausatmen länger werden.'],
   phases:[['Einatmen',3,1],['Ausatmen',4,.55]],
   level:'Cochrane-Übersicht · Asthma',
   ev:'Eine Cochrane-Übersicht ist eine besonders sorgfältige Zusammenfassung vieler Studien. Diese hier fasst 22 Studien mit 2.880 Erwachsenen mit Asthma zusammen. Meist ging es um Atemübungen aus dem Yoga. Nach 3 Monaten war die Lebensqualität besser. Dieses Ergebnis ist mittelmäßig sicher. Bei den Asthma-Beschwerden und der Lungenfunktion war das Ergebnis nicht klar. Zur Bauchatmung allein gab es nur 1 Studie.',
   src:[['Santino et al. 2020, Cochrane Database of Systematic Reviews','10.1002/14651858.CD001277.pub4']]},
  {id:'box', name:'Box-Atmung', short:'Box 4-4-4-4',
   desc:'Auch „Navy-SEAL-Atmung“ genannt. Vier gleich lange Teile wie die Seiten einer Box: einatmen, halten, ausatmen, halten. Gut, um vor einer stressigen Situation ruhig zu werden.',
   steps:['4 Sekunden einatmen.','4 Sekunden die Luft locker halten.','4 Sekunden ausatmen.','4 Sekunden ohne Luft locker warten. Dann von vorn.'],
   phases:[['Einatmen',4,1],['Halten',4,1],['Ausatmen',4,.55],['Halten',4,.55]],
   level:'Erfahrungsbericht und Studie · Gesunde',
   ev:'Bekannt gemacht hat die Box-Atmung Mark Divine, ein früherer Navy SEAL. Die Navy SEALs sind eine Spezial-Einheit der US-Marine. Sie nutzen die Übung, um unter Stress ruhig und klar zu bleiben. Das ist ein Erfahrungsbericht, keine Studie. Eine Studie mit Zufalls-Gruppen aus Stanford hat Atemübungen getestet. Gesunde Erwachsene übten 1 Monat lang 5 Minuten am Tag. Die Atemübungen hoben die Stimmung mehr als eine Meditation. Am meisten half aber eine Übung mit langem Ausatmen, nicht die Box-Atmung. Mit Lungen- oder Herzkrankheit: die Haltezeiten weglassen oder kürzen.',
   src:[['Balban et al. 2023, Cell Reports Medicine','10.1016/j.xcrm.2022.100895']]}];
let cur = EX[0], timer = null, endAt = 0, running = false;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderEx(){
  $('ex-chips').innerHTML = EX.map(e=>'<button class="chip" type="button" data-id="'+e.id+'" aria-pressed="'+(e===cur)+'">'+e.short+'</button>').join('');
  $('ex-name').textContent = cur.name; $('ex-desc').textContent = cur.desc;
  $('ex-steps').innerHTML = cur.steps.map(s=>'<li>'+s+'</li>').join('');
  $('ex-level').textContent = cur.level; $('ex-ev').textContent = cur.ev;
  $('ex-src').innerHTML = cur.src.length ? 'Quelle: '+cur.src.map(s=>s[0]+', <a target="_blank" rel="noopener" href="https://doi.org/'+s[1]+'">doi.org/'+s[1]+'</a>').join('; ') : '';
}
$('ex-chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if(!b) return; stopBreath(); cur = EX.find(x=>x.id===b.dataset.id); renderEx(); });

function stopBreath(){
  running = false; clearTimeout(timer); clearInterval(window.__cd); renderHint('atmen','Lust auf eine längere Atempause?');
  $('start').textContent = 'Starten'; $('phase').textContent = 'Bereit'; $('count').textContent=''; $('remain').textContent='';
  const o=$('orb'); o.style.transitionDuration='600ms'; o.style.transform='scale(.55)';
}
function runPhase(i){
  if(!running) return;
  if(Date.now() >= endAt && i % cur.phases.length === 0){ stopBreath(); $('phase').textContent='Fertig'; $('remain').textContent='Gut gemacht. Atme jetzt einfach normal weiter.'; renderHint('atmen','Lust auf eine längere Atempause?'); return; }
  const [label, sec, scale] = cur.phases[i % cur.phases.length];
  $('phase').textContent = label;
  const o = $('orb'); o.style.transitionDuration = reduce ? '0ms' : sec + 's'; o.style.transform = 'scale(' + scale + ')';
  let left = sec; $('count').textContent = left;
  clearInterval(window.__cd);
  window.__cd = setInterval(()=>{ left--; if(left>0) $('count').textContent = left;
    const r = Math.max(0, Math.round((endAt-Date.now())/1000)); $('remain').textContent = 'noch '+Math.floor(r/60)+':'+String(r%60).padStart(2,'0')+' min'; }, 1000);
  timer = setTimeout(()=>runPhase(i+1), sec*1000);
}
$('start').addEventListener('click', ()=>{
  if(running){ stopBreath(); return; }
  running = true; $('hint-atmen').hidden = true; endAt = Date.now() + Number($('dur').value)*1000; $('start').textContent='Beenden';
  try{ navigator.wakeLock && navigator.wakeLock.request('screen').catch(()=>{}); }catch(e){}
  runPhase(0);
});

/* ---------- Dashboard ---------- */
let isAdmin = false;
const F = {
  'd-tip-title':['tip','title'], 'd-tip-text':['tip','text'],
  'd-p-name':['partner','name'], 'd-p-head':['partner','headline'], 'd-p-text':['partner','text'],
  'd-p-code':['partner','code'], 'd-p-note':['partner','note'], 'd-p-contact':['partner','contact'], 'd-p-url':['partner','url'], 'd-p-phone':['partner','phone'], 'd-p-booking':['partner','booking'], 'd-p-hint':['partner','hint'] };
function fillForm(){
  for(const id in F){ const [a,b]=F[id]; $(id).value = (STATE[a]||{})[b] || ''; }
  $('d-link').value = STATE.appLink || '';
  $('d-store').value = STATE.storeUrl || '';
  $('d-p-showhints').checked = (STATE.partner||{}).showHints !== false;
  $('d-tip-auto').checked = !!(STATE.tip||{}).auto;
  renderQR();
  const t = curDays()[todayIndex()];
  $('d-air').textContent = 'Letzte Aktualisierung: ' + new Date(AIR.updated).toLocaleString('de-AT',{dateStyle:'medium',timeStyle:'short'}) + ' · '+PLACES.length+' Orte' + (t?' · '+curPlace().name+' heute Index '+t.aqi_max+' ('+band(t.aqi_max).name+')':'');
}
function readForm(){
  for(const id in F){ const [a,b]=F[id]; STATE[a] = STATE[a] || {}; STATE[a][b] = $(id).value.trim(); }
  STATE.appLink = $('d-link').value.trim();
  STATE.storeUrl = $('d-store').value.trim();
  STATE.partner.showHints = $('d-p-showhints').checked;
  STATE.tip.auto = $('d-tip-auto').checked;
}
function renderQR(){
  const link = $('d-link').value.trim(), box = $('qr');
  box.innerHTML = '';
  const ok = /^https:\/\/\S+$/.test(link);
  box.hidden = !ok;
  $('d-qr-save').hidden = box.hidden;
  if(!box.hidden){
    const q = qrcode(0, 'M'); q.addData(link); q.make();
    const n = q.getModuleCount(), cell = Math.max(2, Math.floor(220 / n)), c = document.createElement('canvas');
    c.width = c.height = n * cell; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#17262b';
    for(let r = 0; r < n; r++) for(let k = 0; k < n; k++) if(q.isDark(r, k)) g.fillRect(k * cell, r * cell, cell, cell);
    box.appendChild(c);
  }
  $('d-qr-status').textContent = link && !ok ? 'Der Link muss mit https:// beginnen.' : '';
}
$('d-link').addEventListener('input', renderQR);
$('d-qr-save').addEventListener('click', async ()=>{
  const c = $('qr').querySelector('canvas'); if(!c) return;
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'atemwetter-qr.png';
  document.body.appendChild(a); a.click(); a.remove(); $('d-qr-status').textContent = 'Heruntergeladen.';
});

$('d-publish').addEventListener('click', async ()=>{
  const st = $('d-pub-status'); st.className='status';
  if(!isAdmin){ st.className='status err'; st.textContent='Bitte zuerst anmelden.'; return; }
  readForm(); renderContent(); renderToday();
  $('d-publish').disabled = true; st.textContent = 'Wird gespeichert …';
  try{ await api.saveContent(STATE); st.textContent = 'Gespeichert. Web- und Android-App zeigen die Änderung beim nächsten Öffnen.'; }
  catch(e){ st.className='status err'; st.textContent = 'Speichern hat nicht geklappt (' + (e && e.message || 'Fehler') + ').'; }
  finally { $('d-publish').disabled = false; }
});

/* Partner-Codes (nur für Bearbeiter, im Datenspeicher) */
let codes = [];
function renderCodes(){
  $('codes-empty').hidden = codes.length > 0;
  $('codes-body').innerHTML = codes.map(c=>'<tr data-id="'+c.id+'"><td class="cn"></td><td class="num cc"></td><td><span class="num" style="display:inline-block;min-width:2.5ch">'+(c.count||0)+'</span> <button class="btn small ghost" data-act="minus" type="button" aria-label="Einlösung abziehen">−</button> <button class="btn small" data-act="plus" type="button" aria-label="Einlösung zählen">+1</button></td><td><button class="btn small ghost" data-act="del" type="button">Entfernen</button></td></tr>').join('');
  [...$('codes-body').rows].forEach((tr,i)=>{ tr.querySelector('.cn').textContent = codes[i].name; tr.querySelector('.cc').textContent = codes[i].code; });
}
async function loadCodes(){
  const st = $('c-status'); st.className='status'; st.textContent = 'Lädt …';
  try{ codes = await api.listCodes(); st.textContent=''; renderCodes(); }
  catch(e){ st.className='status err'; st.textContent='Die Liste ist nicht verfügbar.'; }
}
let pendingDel = null;
$('codes-body').addEventListener('click', async e=>{
  const b = e.target.closest('button'); if(!b || !isAdmin) return;
  const id = b.closest('tr').dataset.id, c = codes.find(x=>x.id===id); if(!c) return;
  try{
    if(b.dataset.act==='plus'){ await api.changeCount(id, 1); await loadCodes(); }
    if(b.dataset.act==='minus' && (c.count||0)>0){ await api.changeCount(id, -1); await loadCodes(); }
    if(b.dataset.act==='del'){
      if(pendingDel===id){ await api.deleteCode(id); pendingDel=null; await loadCodes(); }
      else { pendingDel=id; b.textContent='Wirklich entfernen?'; setTimeout(()=>{ if(pendingDel===id){ pendingDel=null; b.textContent='Entfernen'; } },4000); }
    }
  }catch(err){ $('c-status').className='status err'; $('c-status').textContent='Änderung nicht gespeichert.'; }
});
$('c-add').addEventListener('click', async ()=>{
  const name = $('c-name').value.trim(), code = $('c-code').value.trim().toUpperCase(), st = $('c-status');
  st.className='status';
  if(!name || !code){ st.className='status err'; st.textContent='Bitte Partner und Code eintragen.'; return; }
  if(codes.some(c=>c.code===code)){ st.className='status err'; st.textContent='Diesen Code gibt es schon.'; return; }
  try{ await api.addCode(name, code); $('c-name').value=''; $('c-code').value=''; await loadCodes(); st.textContent='Angelegt.'; }
  catch(err){ st.className='status err'; st.textContent='Anlegen hat nicht geklappt.'; }
});

function openDash(){ fillForm(); $('dash').hidden = false; $('app').hidden = true; if(isAdmin) loadCodes(); window.scrollTo(0,0); }
function closeDash(){ $('dash').hidden = true; $('app').hidden = false; if(location.hash==='#verwalten') history.replaceState(null,'',location.pathname+location.search); }
$('open-dash').addEventListener('click', openDash);
$('close-dash').addEventListener('click', closeDash);

$('open-admin').addEventListener('click', openDash);
function setAdmin(on, email){
  isAdmin = !!on;
  $('open-dash').hidden = !isAdmin; $('d-admin').hidden = !isAdmin; $('d-logout').hidden = !email;
  $('d-login').hidden = isAdmin;
  if(email && !isAdmin){ $('d-login-status').className='status err'; $('d-login-status').textContent = 'Angemeldet als ' + email + ', aber dieses Konto ist nicht für die Verwaltung freigeschaltet.'; }
  if(isAdmin && !$('dash').hidden){ fillForm(); loadCodes(); }
}
$('d-send-link').addEventListener('click', async ()=>{
  const email = $('d-email').value.trim(), st = $('d-login-status'); st.className='status';
  if(!/^\S+@\S+\.\S+$/.test(email)){ st.className='status err'; st.textContent='Bitte eine gültige E-Mail-Adresse eintragen.'; return; }
  $('d-send-link').disabled = true; st.textContent='Wird gesendet …';
  try{ await api.sendLoginLink(email); st.textContent='Link gesendet. Öffne ihn auf diesem Gerät, dann bist du angemeldet.'; }
  catch(e){ st.className='status err'; st.textContent='Senden hat nicht geklappt (' + (e && e.message || 'Fehler') + ').'; }
  finally{ $('d-send-link').disabled = false; }
});
$('d-logout').addEventListener('click', async ()=>{ await api.signOut(); setAdmin(false, null); });
function initAdmin(){
  if(!api.enabled){ $('open-admin').hidden = true; return; }
  api.onAuth(setAdmin);
  const goDash = () => { if(location.hash === '#verwalten') openDash(); };
  window.addEventListener('hashchange', goDash); goDash();
}

/* ---------- Ort wählen und Standort ---------- */
/* ---------- Persönlicher Tagestipp und Morgen-Mitteilung ---------- */
let profile = {}; try { profile = JSON.parse(LS.get('aw-profile') || '{}') || {}; } catch(e){ profile = {}; }
const tipPrefs = () => ({ profile, allergens: myAllergens.slice() });
const serverPlaceId = () => {
  const p = curPlace(); if(p.id !== 'gps') return p.id;
  if(p.nearId) return p.nearId;
  let best = null, bd = 1e9; PLACES.forEach(q => { if(q.id === 'gps') return; const d = distKm(p.lat, p.lon, q.lat, q.lon); if(d < bd){ bd = d; best = q; } });
  return best ? best.id : (AIR.default || 'dornbirn');
};
let dtipSet = loadSettings();
const notifier = createNotifier({ api, pushKey: () => STATE.pushKey || '', place: () => curPlace(), serverPlaceId, days: () => curDays(), prefs: tipPrefs });
let noteTimer = null;
const refreshNotes = () => { clearTimeout(noteTimer); noteTimer = setTimeout(() => notifier.refresh(dtipSet), 1200); };
function currentTip(){ return dailyTip(curDays()[todayIndex()], tipPrefs(), curPlace().name); }
function renderDailyTip(){
  if(!curDays().length) return;
  const t = currentTip();
  $('dtip').className = 'dtip' + (t.level > 1 ? ' l' + t.level : '');
  $('dtip-eyebrow').textContent = 'Dein Tagestipp · ' + curPlace().name;
  $('dtip-title').textContent = t.title; $('dtip-text').textContent = t.text;
  $('dtip-ex').textContent = 'Übung für heute: ' + t.ex.name; $('dtip-ex').dataset.ex = t.ex.id;
  $('dtip-prof').querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(!!profile[c.dataset.p])));
  $('dtip-on').checked = dtipSet.on; $('dtip-hour').value = String(dtipSet.hour);
  renderDtipPartner(t);
}
// Dezenter MAYOKA-Hinweis beim Tagestipp: nur in der App, nur an passenden Tagen, nur in der Nähe von Dornbirn,
// höchstens alle 3 Tage, als Partner-Angebot gekennzeichnet und für den Tag ausblendbar.
function renderDtipPartner(t){
  const box = $('hint-dtip'), p = STATE.partner || {}, today = todayKey();
  const dorn = PLACES.find(q => q.id === 'dornbirn'), cp = curPlace();
  const near = !!(dorn && typeof cp.lat === 'number' && distKm(cp.lat, cp.lon, dorn.lat, dorn.lon) <= 45);
  const last = LS.get('aw-dtip-p-last');
  const recent = last && last !== today && (new Date(today) - new Date(last)) / 864e5 < 3;
  const line = partnerLine(t);
  if(!line || !near || recent || !/mayoka/i.test(p.name || '') || p.showHints === false || LS.get('aw-hint-dtip') === today){ box.hidden = true; return; }
  LS.set('aw-dtip-p-last', today);
  box.innerHTML = '';
  const tag = document.createElement('span'); tag.className = 'eyebrow'; tag.style.width = '100%'; tag.textContent = 'Partner-Angebot · ' + p.name;
  const tx = document.createElement('span'); tx.textContent = line;
  const go = document.createElement('button'); go.type = 'button'; go.className = 'linkish'; go.textContent = 'Mehr erfahren'; go.addEventListener('click', goPartner);
  const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', 'Hinweis für heute ausblenden'); x.textContent = '×';
  x.addEventListener('click', () => { LS.set('aw-hint-dtip', today); box.hidden = true; });
  const n = document.createElement('small'); n.className = 'muted'; n.style.width = '100%'; n.textContent = 'Eine Wellness-Ergänzung für deine Auszeit. Kein Ersatz für ärztliche Behandlung.';
  box.append(tag, tx, go, x, n);
  box.hidden = false;
}
function dtipHelp(){
  const pf = notePlatform(), h = $('dtip-on-help');
  h.textContent = '';
  if(pf === 'native-old'){ h.append('Für Mitteilungen braucht es ein kurzes App-Update (deine Einstellungen bleiben erhalten): '); const a = document.createElement('a'); a.href = 'https://github.com/wolfgangtiefenthaler78-sys/atemwetter/releases/latest/download/atemwetter.apk'; a.textContent = 'Jetzt aktualisieren'; h.append(a, '. Die heruntergeladene Datei antippen und „Aktualisieren“ wählen. Bis dahin erscheint der Tipp beim ersten Öffnen am Morgen.'); }
  else if(pf === 'ios-browser'){ h.append('Am iPhone kommen Mitteilungen, wenn Atemwetter auf dem Home-Bildschirm liegt: '); const a = document.createElement('a'); a.href = 'https://wolfgangtiefenthaler78-sys.github.io/atemwetter/iphone.html'; a.textContent = 'So geht’s'; h.append(a, '. Bis dahin erscheint der Tipp beim ersten Öffnen am Morgen.'); }
  else if(pf === 'none') h.textContent = 'Dieser Browser kann keine Mitteilungen anzeigen. Der Tipp erscheint dann beim ersten Öffnen am Morgen.';
  else h.textContent = 'Der Tagestipp erscheint am Morgen auf deinem Handy oder PC, auch wenn Atemwetter geschlossen ist. Jederzeit wieder abschaltbar.';
}
$('dtip-set-btn').addEventListener('click', () => { const open = $('dtip-set').hidden; $('dtip-set').hidden = !open; $('dtip-set-btn').setAttribute('aria-expanded', String(open)); if(open) dtipHelp(); });
$('dtip-prof').addEventListener('click', e => { const c = e.target.closest('.chip'); if(!c) return;
  profile[c.dataset.p] = !profile[c.dataset.p]; LS.set('aw-profile', JSON.stringify(profile)); renderDailyTip(); refreshNotes(); });
$('dtip-to-al').addEventListener('click', () => { location.hash = 'allergie'; show('allergie'); window.scrollTo(0, 0); });
$('dtip-ex').addEventListener('click', () => { const ex = EX.find(e => e.id === $('dtip-ex').dataset.ex); if(ex){ cur = ex; renderEx(); } location.hash = 'atmen'; show('atmen'); window.scrollTo(0, 0); });
$('dtip-on').addEventListener('change', async () => {
  const st = $('dtip-status'); st.className = 'status'; st.textContent = 'Einen Moment …';
  const on = $('dtip-on').checked; $('dtip-on').disabled = true;
  try {
    if(on){ dtipSet = { on: true, hour: Number($('dtip-hour').value) }; st.textContent = await notifier.enable(dtipSet); }
    else { await notifier.disable(); dtipSet = { on: false, hour: Number($('dtip-hour').value) }; st.textContent = 'Ausgeschaltet. Es kommen keine Mitteilungen mehr.'; }
    saveSettings(dtipSet);
  } catch(e){
    $('dtip-on').checked = false; dtipSet.on = false; saveSettings(dtipSet);
    st.className = 'status err'; st.textContent = (e && e.message) || 'Das hat nicht geklappt. Bitte nochmals versuchen.';
  } finally { $('dtip-on').disabled = false; }
});
$('dtip-hour').addEventListener('change', () => { dtipSet.hour = Number($('dtip-hour').value); saveSettings(dtipSet); if(dtipSet.on){ $('dtip-status').className = 'status'; $('dtip-status').textContent = 'Neue Uhrzeit: ' + dtipSet.hour + ':00 Uhr.'; refreshNotes(); } });
notifier.onTap(() => { location.hash = 'heute'; show('heute'); window.scrollTo(0, 0); });
// Einblendung am Morgen, wo keine echte Mitteilung möglich ist (oder nicht erlaubt wurde)
function maybePopup(){
  if(!dtipSet.on || notifier.systemReady() || !curDays().length) return;
  const today = todayKey(), hour = Number(new Date().toLocaleString('en-GB',{timeZone:'Europe/Vienna',hour:'2-digit',hour12:false})) % 24;
  if(LS.get('aw-dtip-seen') === today || hour < dtipSet.hour) return;
  const t = currentTip();
  $('dtip-pop-title').textContent = t.title; $('dtip-pop-text').textContent = t.text; $('dtip-pop').hidden = false;
  LS.set('aw-dtip-seen', today);
}
$('dtip-pop-ok').addEventListener('click', () => { $('dtip-pop').hidden = true; });
$('dtip-pop-off').addEventListener('click', async () => { $('dtip-pop').hidden = true; dtipSet.on = false; saveSettings(dtipSet); try { await notifier.disable(); } catch(e){} renderDailyTip(); });

function renderAll(){ renderToday(); renderDailyTip(); renderContent(); renderCopd(); renderAsthma(); renderAllergy(); refreshNotes(); }
window.__AW.rerender = () => { renderAll(); renderPlaces(); };
window.__AW.setPlace = (id, auto) => setPlace(id, auto);
window.__AW.setState = (st) => {
  if(!st) return;
  if(st.tip) STATE.tip = st.tip; if(st.partner) STATE.partner = st.partner; if(st.appLink) STATE.appLink = st.appLink; if(st.pushKey) STATE.pushKey = st.pushKey;
  renderContent(); renderAll(); if(!running) renderHint('atmen','Lust auf eine längere Atempause?');
};
function setPlace(id, auto){
  placeId = id; if(!auto){ LS.set('aw-place', id); autoInfo=''; }
  renderAll(); renderPlaces();
  if(window.__AWNative && window.__AWNative.onPlace) window.__AWNative.onPlace(curPlace());
}
function renderPlaces(){
  const q = $('place-search').value.trim().toLowerCase();
  const groups = {};
  PLACES.filter(p=>!q || p.name.toLowerCase().includes(q) || (p.region||'').toLowerCase().includes(q)).forEach(p=>{ (groups[p.region||'Orte']=groups[p.region||'Orte']||[]).push(p); });
  const keys = Object.keys(groups);
  $('place-list').innerHTML = keys.length ? keys.map(g=>'<div class="place-group"><div class="eyebrow">'+g+'</div><div class="chips">'+groups[g].map(p=>'<button class="chip" type="button" role="option" data-id="'+p.id+'" aria-pressed="'+(p.id===placeId)+'" aria-selected="'+(p.id===placeId)+'">'+p.name+'</button>').join('')+'</div></div>').join('') : '<p class="muted">Kein Ort gefunden. Versuche einen größeren Ort in der Nähe.</p>';
}
$('place-list').addEventListener('click', e=>{ const b=e.target.closest('.chip'); if(!b) return;
  if($('auto-loc').checked){ $('auto-loc').checked=false; LS.set('aw-auto',null); $('auto-status').textContent='Automatik ausgeschaltet, weil du einen Ort gewählt hast.'; }
  setPlace(b.dataset.id,false); closePicker(); });
$('place-search').addEventListener('input', renderPlaces);
function openPicker(){ $('picker').hidden=false; $('place-btn').setAttribute('aria-expanded','true'); renderPlaces(); $('place-search').focus(); }
function closePicker(){ $('picker').hidden=true; $('place-btn').setAttribute('aria-expanded','false'); }
$('place-btn').addEventListener('click', ()=> $('picker').hidden ? openPicker() : closePicker());
$('picker-close').addEventListener('click', closePicker);

function distKm(a,b,c,d){ const R=6371, t=x=>x*Math.PI/180; const h=Math.sin(t(c-a)/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(t(d-b)/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
const IS_APP = !!(window.__AWNative && window.__AWNative.getPosition);
function geoHelp(code){
  if(code===1) return IS_APP
    ? 'Die App darf deinen Standort nicht verwenden. Erlauben: Android-Einstellungen › Apps › Atemwetter › Berechtigungen › Standort › „Nur während der Nutzung“.'
    : 'Dein Browser blockiert den Standort für diese Seite. So erlaubst du es: links neben der Adresse auf das Schloss tippen › Standort › Zulassen. Dann die Seite neu laden.';
  if(code===2) return 'Der Standort ist am Gerät gerade nicht verfügbar. Ist der Standortdienst (GPS) eingeschaltet? Am Handy: von oben wischen › „Standort“ antippen.';
  return 'Die Standortbestimmung hat zu lange gedauert. Am besten im Freien oder mit eingeschaltetem WLAN nochmals versuchen.';
}
function retryLink(st){ const b=document.createElement('button'); b.type='button'; b.className='linkish'; b.textContent='Nochmals versuchen'; b.style.marginLeft='6px'; b.addEventListener('click', ()=>locate(true)); st.append(' ', b); }
function locate(manual){
  const st = $('auto-status'); st.className='status'; st.textContent='Standort wird ermittelt …';
  $('locate-now').disabled = true;
  const getPos = IS_APP ? window.__AWNative.getPosition : ((ok, fail, o) => navigator.geolocation.getCurrentPosition(ok, fail, o));
  const done = pos=>{
    $('locate-now').disabled = false;
    const {latitude:la, longitude:lo} = pos.coords;
    let best=null, bd=1e9; PLACES.forEach(p=>{ if(p.id==='gps') return; const d=distKm(la,lo,p.lat,p.lon); if(d<bd){bd=d;best=p;} });
    if(!best) return;
    autoInfo = 'automatisch';
    const live = (window.__AWNative && window.__AWNative.onPosition) || window.__AWLive;
    if(live){ live(la, lo, st); }
    else {
      setPlace(best.id, true);
      st.textContent = bd > 60 ? 'Nächster Ort in der Liste: '+best.name+' ('+Math.round(bd)+' km entfernt). Die Werte können für deinen Standort abweichen.' : 'Gefunden: '+best.name+' (etwa '+Math.max(1,Math.round(bd))+' km entfernt).';
    }
    if(manual) setTimeout(closePicker, 1600);
  };
  const failed = err=>{
    $('locate-now').disabled = false;
    const code = err && err.code || 2;
    st.className='status err'; st.textContent = geoHelp(code);
    if(code!==1) retryLink(st);
    if(err && err.detail){ const d=document.createElement('small'); d.className='muted'; d.style.display='block'; d.textContent='Technischer Hinweis: '+err.detail; st.appendChild(d); }
    if(code===1){ $('auto-loc').checked=false; LS.set('aw-auto',null); }
  };
  // erst schnell und sparsam (WLAN/Mobilfunk), dann – falls das nicht klappt – mit GPS
  getPos(done, err=>{
    if(err && err.code===1) return failed(err);
    getPos(done, failed, {enableHighAccuracy:true, timeout:25000, maximumAge:0});
  }, {enableHighAccuracy:false, timeout:10000, maximumAge:30*60*1000});
}
$('locate-now').addEventListener('click', ()=>locate(true));
$('auto-loc').addEventListener('change', ()=>{
  if($('auto-loc').checked){ LS.set('aw-auto','1'); locate(false); }
  else { LS.set('aw-auto',null); autoInfo=''; $('auto-status').textContent='Automatik ausgeschaltet.'; setPlace(LS.get('aw-place') || AIR.default || PLACES[0].id, true); }
});
async function initGeo(){
  if(!('geolocation' in navigator) && !IS_APP) return;
  $('auto-box').hidden = false;
  let state = 'prompt';
  try{ if(!IS_APP && navigator.permissions && navigator.permissions.query){ state = (await navigator.permissions.query({name:'geolocation'})).state; } }catch(e){}
  if(state === 'denied'){ $('auto-status').className='status err'; $('auto-status').textContent = geoHelp(1); return; }
  if(LS.get('aw-auto')==='1'){ $('auto-loc').checked = true; locate(false); }
}

renderToday(); renderDailyTip(); renderContent(); renderEx(); renderCopd(); renderAsthma(); renderAllergy(); renderHint('atmen','Lust auf eine längere Atempause?'); show(location.hash.slice(1));
refreshNotes(); setTimeout(maybePopup, 1500);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') maybePopup(); });
// In den installierten Apps und am Home-Bildschirm die Hinweise „Fürs iPhone“ / „Android-App“ ausblenden
{ const C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
  const home = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if(native || home){ $('foot-iphone').hidden = true; $('foot-android').hidden = true; } }
initGeo();
initAdmin();
try{ if(window.__AW_RUNNING) localStorage.setItem('aw-boot-ok', window.__AW_RUNNING); }catch(e){}
return { rerender: () => window.__AW.rerender(), setState: st => window.__AW.setState(st), replaceAir: air => { PLACES.splice(0, PLACES.length, ...air.places); AIR.updated = air.updated; window.__AW.rerender(); } };
}
