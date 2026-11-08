/* Atemwetter – Oberfläche. Daten und Speichern kommen über `api` (src/data.js). */
import qrcode from 'qrcode-generator';
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
  {max:20,  name:'Gut',            color:'var(--q1)', text:'Saubere Luft im Tal. Ein guter Tag für Bewegung draußen und zum Lüften.'},
  {max:40,  name:'Recht gut',      color:'var(--q2)', text:'Die Luft ist überwiegend sauber. Für die meisten Menschen gibt es keine Einschränkungen.'},
  {max:60,  name:'Mäßig',          color:'var(--q3)', text:'Für die meisten unproblematisch. Wer empfindliche Atemwege hat, legt anstrengende Einheiten im Freien eher kürzer an.'},
  {max:80,  name:'Schlecht',       color:'var(--q4)', text:'Erhöhte Belastung. Empfindliche Personen reduzieren Anstrengung im Freien und lüften zu ruhigeren Tageszeiten.'},
  {max:100, name:'Sehr schlecht',  color:'var(--q5)', text:'Hohe Belastung. Anstrengung im Freien möglichst vermeiden, besonders mit Atemwegserkrankung.'},
  {max:1e9, name:'Extrem schlecht',color:'var(--q6)', text:'Sehr hohe Belastung. Aufenthalte im Freien kurz halten.'}];
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
  $('lede').textContent = b.text + ' Angegeben ist der höchste Stundenwert des Tages.';
  $('scale-bar').innerHTML = BANDS.map(x => '<i style="background:'+x.color+'"></i>').join('');
  $('scale-marker').style.left = Math.min(100, t.aqi_max / 120 * 100) + '%';

  const P = [
    {k:'pm25', n:'Feinstaub PM2,5', s:'Tagesmittel · WHO-Richtwert 15', lim:15, u:'µg/m³'},
    {k:'pm10', n:'Feinstaub PM10',  s:'Tagesmittel · WHO-Richtwert 45', lim:45, u:'µg/m³'},
    {k:'no2',  n:'Stickstoffdioxid',s:'Tagesmittel · WHO-Richtwert 25', lim:25, u:'µg/m³'},
    {k:'o3_max',n:'Ozon',           s:'Spitzenstunde · WHO-Richtwert 100 (8 h)', lim:100, u:'µg/m³'}];
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
    stark:'Kaum Wind und feuchte Luft am Morgen, oft mit Nebel oder Hochnebel. Abgase und Feinstaub verteilen sich dann kaum und bleiben bodennah, besonders in Tälern. Bewegung im Freien eher auf die Mittagszeit legen oder in höhere Lagen ausweichen.',
    leicht:'Schwacher Wind am Morgen, der Luftaustausch ist eingeschränkt. Zum Lüften eignet sich die Tagesmitte besser als der frühe Morgen.',
    keine:'Genug Wind am Morgen, die Luft wird gut durchmischt.'};
  $('h-inv').textContent = inv ? ({stark:'Austauscharme Wetterlage',leicht:'Eingeschränkter Luftaustausch',keine:'Gute Durchmischung'})[inv.level] || 'Luftaustausch' : 'Keine Angabe';
  $('inv-text').textContent = inv ? INV[inv.level] : 'Für heute liegen keine Temperaturdaten vor.';
  $('inv-num').textContent = !inv || inv.level==='na' ? '' : (typeof inv.wind==='number' ? '06–10 Uhr · Wind '+fmt(inv.wind,1)+' m/s · Luftfeuchte '+fmt(inv.rh)+' %' : '07:00 Uhr · '+fmt(inv.t2m,1)+' °C');

  const trueb = (inv && (inv.level==='stark' || inv.level==='leicht')) || t.aqi_max > 40;
  renderHint('heute', trueb ? (inv && inv.level==='stark' ? 'Bei trüber Talluft:' : 'Wenn die Luft draußen schwer wirkt:') : 'Für eine bewusste Pause:');
  const PN = POLLEN_NAMES;
  const lvl = (v,k) => { const L = pollenLevel(k,v); return [L.name, [0,25,60,100][L.i]]; };
  const pol = t.pollen || {};
  const active = Object.keys(PN).filter(k => (pol[k]||0) >= 1);
  $('pollen').innerHTML = t.pollen == null ? '<p class="muted" style="padding-top:10px">Tagesgenaue Pollenwerte sind in dieser Version noch nicht eingebunden. Den Blühkalender und Tipps findest du im Allergie-Check.</p>' : active.length ? active.map(k => {
    const [l,w] = lvl(pol[k],k);
    return '<div class="row"><div class="name"><b>'+PN[k]+'</b><small>Tageshöchstwert</small></div><div class="meter"><span class="'+(l==='hoch'?'over':'')+'" style="width:'+w+'%"></span></div><div class="val"><span class="num">'+fmt(pol[k])+'</span> <small>Körner/m³ · '+l+'</small></div></div>';
  }).join('') : '<p class="muted" style="padding-top:10px">Im Modell ist heute keine relevante Pollenbelastung für Erle, Birke, Gräser, Beifuß oder Ambrosia zu sehen.</p>';

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
const POLLEN_NAMES = {alder:'Erle',birch:'Birke',grass:'Gräser',mugwort:'Beifuß',ragweed:'Ambrosia'};
const POLLEN_TH = {alder:[10,50], birch:[10,100], grass:[10,50], mugwort:[5,20], ragweed:[3,10]};
const LEVELS = [{name:'keine',c:'var(--q1)'},{name:'gering',c:'var(--q2)'},{name:'mäßig',c:'var(--q3)'},{name:'hoch',c:'var(--q4)'}];
function pollenLevel(k,v){ v=v||0; const t=POLLEN_TH[k]||[10,50]; const i = v<1?0 : v<t[0]?1 : v<t[1]?2 : 3; return Object.assign({i}, LEVELS[i]); }
let myAllergens = (LS.get('aw-allergens')||'').split(',').filter(k=>POLLEN_NAMES[k]);
function renderSeason(nowMonth){
  // Saisonkalender
  const SEASON = [['Hasel',[0,1,2]],['Erle',[0,1,2,3]],['Esche',[2,3]],['Birke',[2,3,4]],['Gräser',[4,5,6,7]],['Beifuß',[6,7,8]],['Ambrosia',[7,8,9]]];
  const MON = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const nowM = nowMonth;
  $('al-season').innerHTML = '<span></span>'+MON.map((x,i)=>'<span class="m'+(i===nowM?' now':'')+'">'+x+'</span>').join('') +
    SEASON.map(([n,ms,note])=>'<span class="nm"><b>'+n+'</b>'+(note?'<br><small>'+note+'</small>':'')+'</span>'+MON.map((x,i)=>'<span class="cell'+(ms.includes(i)?' on':'')+(i===nowM?' now':'')+'"></span>').join('')).join('');
}
function renderAllergy(){
  const days = curDays(); if(!days.length) return;
  const ti = todayIndex(), t = days[ti];
  const keys = myAllergens.length ? myAllergens : Object.keys(POLLEN_NAMES);
  $('al-chips').innerHTML = Object.keys(POLLEN_NAMES).map(k=>'<button class="chip" type="button" data-k="'+k+'" aria-pressed="'+myAllergens.includes(k)+'">'+POLLEN_NAMES[k]+'</button>').join('');
  const nowM = new Date().getMonth();
  const SEAS = {alder:[0,1,2,3], birch:[2,3,4], grass:[4,5,6,7], mugwort:[6,7,8], ragweed:[7,8,9]};
  if(t.pollen == null){
    const inSeason = keys.filter(k=>SEAS[k].includes(nowM));
    $('al-date').textContent = 'Pollen-Check · ' + curPlace().name + ' · ' + dayName(t.date);
    $('al-verdict').textContent = inSeason.length ? 'Blütezeit läuft' : 'Außerhalb der Blütezeit';
    $('al-dot').style.background = inSeason.length ? 'var(--q3)' : 'var(--q1)';
    $('al-pill').textContent = myAllergens.length ? 'Deine Auswahl: ' + myAllergens.map(k=>POLLEN_NAMES[k]).join(', ') : 'Alle Pollenarten';
    $('al-lede').textContent = inSeason.length
      ? 'Laut Blühkalender ist jetzt typischerweise Saison für ' + inSeason.map(k=>POLLEN_NAMES[k]).join(', ') + '. Tagesgenaue Messwerte bietet der Österreichische Pollenwarndienst.'
      : 'Für ' + (myAllergens.length ? 'deine Pollenarten' : 'die erfassten Pollenarten') + ' ist laut Blühkalender gerade keine Saison. In der Heizperiode können eher Hausstaubmilben oder Schimmelsporen in Innenräumen eine Rolle spielen.';
    $('al-days-sec').hidden = true;
    $('al-times-text').textContent = 'Allgemein gilt: In der Pollenzeit lieber kurz und kräftig lüften, nach einem Regenguss ist die Luft oft für einige Zeit pollenärmer. Für Feinstaub und Luftaustausch siehe die Ansicht „Heute“.';
    renderSeason(nowM);
    renderHint('allergie', 'Zum Abschalten zwischendurch:');
    return;
  }
  $('al-days-sec').hidden = false;
  const lv = keys.map(k=>({k, v:(t.pollen||{})[k]||0, L:pollenLevel(k,(t.pollen||{})[k])})).sort((a,b)=>b.L.i-a.L.i||b.v-a.v);
  const worst = lv[0].L;
  const V = ['Pollenfreier Tag','Geringe Belastung','Mäßige Belastung','Hohe Belastung'];
  const LED = ['Im Modell fliegen heute keine relevanten Pollen'+(myAllergens.length?' deiner Arten':'')+'. ',
    'Es fliegen einzelne Pollen. Sehr empfindliche Menschen können leichte Beschwerden bemerken.',
    'Spürbare Belastung. Wer allergisch reagiert, plant Zeit draußen bewusst und hält die verordneten Medikamente bereit.',
    'Starke Belastung. Aufenthalte im Freien möglichst kurz halten, Fenster tagsüber eher geschlossen lassen.'];
  const m = new Date(t.date+'T12:00:00').getMonth();
  const offSeason = worst.i===0 && (m>=9 || m<=0);
  $('al-date').textContent = 'Pollen-Check · ' + curPlace().name + ' · ' + dayName(t.date);
  $('al-verdict').textContent = V[worst.i]; $('al-dot').style.background = worst.c;
  $('al-pill').textContent = myAllergens.length ? 'Deine Auswahl: ' + myAllergens.map(k=>POLLEN_NAMES[k]).join(', ') : 'Alle Pollenarten im Modell';
  $('al-lede').textContent = LED[worst.i] + (offSeason ? 'Die Pollensaison ruht gerade. In der Heizperiode können eher Hausstaubmilben oder Schimmelsporen in Innenräumen eine Rolle spielen.' : '');
  // 3-Tage-Tabelle
  $('al-table').innerHTML = '<thead><tr><th>Pollenart</th>'+days.map((d,i)=>'<th>'+(i===ti?'Heute':shortDay(d.date))+'</th>').join('')+'</tr></thead><tbody>'+
    keys.map(k=>'<tr><td><b>'+POLLEN_NAMES[k]+'</b></td>'+days.map(d=>{ const v=(d.pollen||{})[k]||0, L=pollenLevel(k,v); return '<td><span class="lv"><span class="dot" style="background:'+L.c+'"></span>'+L.name+(v>=1?' <span class="num muted" style="font-size:.82rem">'+fmt(v)+'</span>':'')+'</span></td>'; }).join('')+'</tr>').join('')+'</tbody>';
  // beste Lüftzeit aus Stundenwerten
  const ph = t.pollen_hourly || {};
  const active = keys.filter(k=>ph[k]);
  let txt;
  if(!active.length){ txt = 'Heute gibt es keine Einschränkung durch Pollen. Lüften und Rausgehen ist jederzeit möglich; für Feinstaub und Luftaustausch siehe die Ansicht „Heute“.'; }
  else {
    const sum = h => active.reduce((a,k)=>a+(ph[k][h]||0),0);
    let lo=6, hi=6; for(let h=6; h<=21; h++){ if(sum(h)<sum(lo)) lo=h; if(sum(h)>sum(hi)) hi=h; }
    txt = 'Laut Modell sind deine Pollen heute gegen '+String(lo).padStart(2,'0')+':00 Uhr am niedrigsten, ein guter Zeitpunkt zum Stoßlüften. Die höchste Belastung wird gegen '+String(hi).padStart(2,'0')+':00 Uhr erwartet; dann Aktivitäten im Freien eher meiden.';
  }
  $('al-times-text').textContent = txt;
  renderHint('allergie', 'Zum Abschalten zwischendurch:');
  renderSeason(new Date().getMonth());
}
$('al-chips').addEventListener('click', e=>{ const b=e.target.closest('.chip'); if(!b) return; const k=b.dataset.k;
  myAllergens = myAllergens.includes(k) ? myAllergens.filter(x=>x!==k) : myAllergens.concat(k);
  LS.set('aw-allergens', myAllergens.length ? myAllergens.join(',') : null); renderAllergy(); renderAsthma(); });
$('to-allergie').addEventListener('click', ()=>{ location.hash='allergie'; show('allergie'); window.scrollTo(0,0); });

/* ---------- COPD ---------- */
function renderCopd(){
  const days = curDays(); if(!days.length) return;
  const t = days[todayIndex()], inv = t.inversion || {};
  const F = [];
  const add = (lvl, name, val, tip) => F.push({lvl, name, val, tip});
  if(t.aqi_max > 60) add(2,'Luftqualität insgesamt','Index '+t.aqi_max,'Anstrengung draußen heute reduzieren, Spaziergänge kurz halten.');
  else if(t.aqi_max > 40) add(1,'Luftqualität insgesamt','Index '+t.aqi_max,'Längere Belastung im Freien eher in die Tagesmitte legen.');
  else add(0,'Luftqualität insgesamt','Index '+t.aqi_max,'Gute Bedingungen für Bewegung im Freien.');
  if(t.pm25 > 25) add(2,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Deutlich über dem WHO-Richtwert. Nicht an stark befahrenen Straßen gehen.');
  else if(t.pm25 > 15 || t.pm10 > 45) add(1,'Feinstaub',fmt(t.pm25,1)+' µg/m³ PM2,5','Über dem WHO-Richtwert. Hauptverkehrsstraßen meiden, zu ruhigen Zeiten lüften.');
  else add(0,'Feinstaub',fmt(t.pm25,1)+' µg/m³ PM2,5','Unter dem WHO-Richtwert.');
  if(t.no2 > 25) add(1,'Stickstoffdioxid',fmt(t.no2,1)+' µg/m³','Typisch an Verkehrsachsen. Wege abseits der Hauptstraßen wählen.');
  if(inv.level==='stark') add(1,'Wenig Luftaustausch','am Morgen','Kaum Wind, belastete Luft bleibt morgens bodennah. Draußen eher mittags unterwegs sein.');
  if(typeof inv.t2m === 'number'){
    if(inv.t2m < -5) add(2,'Kalte Luft',fmt(inv.t2m,1)+' °C früh','Viele Betroffene empfinden eisige Luft als belastend. Schal locker vor Mund und Nase, durch die Nase atmen, Tempo drosseln.');
    else if(inv.t2m < 2) add(1,'Kühle Luft',fmt(inv.t2m,1)+' °C früh','Bei kalter Luft hilft vielen ein Schal vor Mund und Nase und ein ruhiger Start.');
  }
  const worst = Math.max(...F.map(f=>f.lvl));
  const V = [
    {n:'Ruhiger Tag', c:'var(--q2)', l:'Die Luft macht es heute leicht. Ein guter Tag für die geplante Bewegung, gern auch etwas länger.'},
    {n:'Achtsam', c:'var(--q3)', l:'Ein paar Faktoren sprechen heute für etwas mehr Ruhe beim Draußensein. Bewegung bleibt wichtig, nur besser dosiert.'},
    {n:'Vorsicht', c:'var(--q4)', l:'Heute ist die Belastung für empfindliche Atemwege erhöht. Bewegung lieber drinnen oder kurz und langsam; Notfallspray griffbereit.'}][worst];
  $('copd-date').textContent = 'Mit COPD · ' + curPlace().name + ' · ' + dayName(t.date);
  $('copd-verdict').textContent = V.n; $('copd-dot').style.background = V.c; $('copd-lede').textContent = V.l;
  $('copd-pill').textContent = F.filter(f=>f.lvl>0).length ? F.filter(f=>f.lvl>0).length + ' Faktor' + (F.filter(f=>f.lvl>0).length>1?'en':'') + ' zu beachten' : 'Nichts Besonderes zu beachten';
  const LC = ['var(--q2)','var(--q3)','var(--q4)'];
  $('copd-factors').innerHTML = F.sort((a,b)=>b.lvl-a.lvl).map(f=>'<div class="row" style="grid-template-columns:auto minmax(0,1fr) auto"><span class="dot" style="background:'+LC[f.lvl]+'"></span><div class="name"><b>'+f.name+'</b><small>'+f.tip+'</small></div><div class="val num">'+f.val+'</div></div>').join('');
  const POS = [
    ['Kutschersitz','Sitzend leicht vorbeugen, Unterarme auf die Oberschenkel stützen, Schultern sinken lassen.'],
    ['Torwartstellung','Stehend die Knie leicht beugen, Hände oberhalb der Knie aufstützen, Oberkörper leicht vor.'],
    ['Wandstellung','Mit Gesäß und Rücken an die Wand lehnen, Füße eine Fußlänge vor, Arme hängen lassen.']];
  renderHint('copd', 'Eine ruhige Pause abseits des Alltags:');
  $('copd-pos').innerHTML = POS.map(p=>'<div class="day"><span class="d">'+p[0]+'</span><span class="muted" style="font-size:.92rem">'+p[1]+'</span></div>').join('');
}
$('copd-to-lippen').addEventListener('click', ()=>{ cur = EX.find(e=>e.id==='lippen'); renderEx(); location.hash='atmen'; show('atmen'); window.scrollTo(0,0); });

/* ---------- Asthma ---------- */
function renderAsthma(){
  const days = curDays(); if(!days.length) return;
  const t = days[todayIndex()], inv = t.inversion || {};
  const F = [];
  const add = (lvl, name, val, tip) => F.push({lvl, name, val, tip});
  if(t.aqi_max > 60) add(2,'Luftqualität insgesamt','Index '+t.aqi_max,'Anstrengung im Freien heute reduzieren, Bedarfsspray griffbereit halten.');
  else if(t.aqi_max > 40) add(1,'Luftqualität insgesamt','Index '+t.aqi_max,'Längere Belastung im Freien gut dosieren.');
  else add(0,'Luftqualität insgesamt','Index '+t.aqi_max,'Gute Bedingungen für Bewegung im Freien.');
  if(typeof t.o3_max === 'number'){
    if(t.o3_max > 140) add(2,'Ozon',fmt(t.o3_max)+' µg/m³ Spitze','Deutlich erhöht. Sport im Freien auf den Vormittag legen oder nach drinnen verlegen.');
    else if(t.o3_max > 100) add(1,'Ozon',fmt(t.o3_max)+' µg/m³ Spitze','Über dem WHO-Richtwert. Anstrengung draußen eher am Vormittag.');
  }
  if(t.pm25 > 25) add(2,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Deutlich über dem WHO-Richtwert. Nicht an stark befahrenen Straßen gehen.');
  else if(t.pm25 > 15) add(1,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Über dem WHO-Richtwert. Hauptverkehrsstraßen meiden, zu ruhigen Zeiten lüften.');
  else add(0,'Feinstaub PM2,5',fmt(t.pm25,1)+' µg/m³','Unter dem WHO-Richtwert.');
  if(t.no2 > 25) add(1,'Stickstoffdioxid',fmt(t.no2,1)+' µg/m³','Typisch an Verkehrsachsen. Wege abseits der Hauptstraßen wählen.');
  const keys = myAllergens.length ? myAllergens : Object.keys(POLLEN_NAMES);
  let pw = {i:0, k:null, v:0};
  keys.forEach(k=>{ const v=(t.pollen||{})[k]||0, L=pollenLevel(k,v); if(L.i>pw.i) pw={i:L.i, k, v}; });
  if(pw.i>=3) add(2,'Pollen: '+POLLEN_NAMES[pw.k],'hoch','Bei allergischem Asthma ein starker Auslöser. Zeit draußen kurz halten, nach dem Heimkommen Gesicht und Haare waschen.');
  else if(pw.i===2) add(1,'Pollen: '+POLLEN_NAMES[pw.k],'mäßig','Bei allergischem Asthma spürbar. Lüften zu pollenarmen Zeiten, siehe Allergie-Check.');
  else add(0,'Pollen', pw.i ? 'gering' : 'keine','Im Modell heute kein relevanter Pollenflug'+(myAllergens.length?' deiner Arten':'')+'.');
  if(typeof inv.t2m === 'number'){
    if(inv.t2m < -5) add(2,'Kalte Luft',fmt(inv.t2m,1)+' °C früh','Kalte, trockene Luft kann die Atemwege verengen. Schal vor Mund und Nase, ruhig aufwärmen, Tempo drosseln.');
    else if(inv.t2m < 2) add(1,'Kühle Luft',fmt(inv.t2m,1)+' °C früh','Vor Bewegung draußen gut aufwärmen und durch die Nase atmen.');
  }
  if(inv.level==='stark') add(1,'Wenig Luftaustausch','am Morgen','Kaum Wind, belastete Luft bleibt morgens bodennah. Draußen eher mittags unterwegs sein.');
  const worst = Math.max(...F.map(f=>f.lvl));
  const V = [
    {n:'Ruhiger Tag', c:'var(--q2)', l:'Die Luft macht es heute leicht. Ein guter Tag für Bewegung im Freien, das Bedarfsspray trotzdem dabei.'},
    {n:'Achtsam', c:'var(--q3)', l:'Ein paar Auslöser sind heute erhöht. Bewegung bleibt wichtig, nur besser dosiert und gut aufgewärmt.'},
    {n:'Vorsicht', c:'var(--q4)', l:'Heute sind starke Auslöser unterwegs. Anstrengung im Freien kurz halten, Bedarfsspray griffbereit, auf Warnzeichen achten.'}][worst];
  const n = F.filter(f=>f.lvl>0).length;
  $('as-date').textContent = 'Mit Asthma · ' + curPlace().name + ' · ' + dayName(t.date);
  $('as-verdict').textContent = V.n; $('as-dot').style.background = V.c; $('as-lede').textContent = V.l;
  $('as-pill').textContent = n ? n + ' Auslöser zu beachten' : 'Nichts Besonderes zu beachten';
  const LC = ['var(--q2)','var(--q3)','var(--q4)'];
  $('as-factors').innerHTML = F.sort((a,b)=>b.lvl-a.lvl).map(f=>'<div class="row" style="grid-template-columns:auto minmax(0,1fr) auto"><span class="dot" style="background:'+LC[f.lvl]+'"></span><div class="name"><b>'+f.name+'</b><small>'+f.tip+'</small></div><div class="val num">'+f.val+'</div></div>').join('');
  renderHint('asthma', 'Eine ruhige Pause abseits des Alltags:');
}
$('as-to-bauch').addEventListener('click', ()=>{ cur = EX.find(e=>e.id==='bauch'); renderEx(); location.hash='atmen'; show('atmen'); window.scrollTo(0,0); });
$('as-to-allergie').addEventListener('click', ()=>{ location.hash='allergie'; show('allergie'); window.scrollTo(0,0); });

/* ---------- Inhalte ---------- */
function renderContent(){
  const tip = STATE.tip || {}, p = STATE.partner || {};
  $('tip-title').textContent = tip.title || '';
  $('tip-text').textContent = tip.text || '';
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
   desc:'Langsames Atmen mit etwa sechs Atemzügen pro Minute. Die Ausatmung ist länger als die Einatmung.',
   steps:['Aufrecht und bequem sitzen, Schultern locker.','Vier Sekunden ruhig durch die Nase einatmen.','Sechs Sekunden langsam ausatmen.','Nicht tiefer atmen als angenehm, nur langsamer.'],
   phases:[['Einatmen',4,1],['Ausatmen',6,.55]],
   level:'Systematische Übersicht · Gesunde',
   ev:'Eine systematische Übersicht von 15 kleinen Studien an Gesunden fand bei Atmung unter zehn Zügen pro Minute eine höhere Herzratenvariabilität und mehr berichtete Entspannung. Die Studien sind klein und methodisch uneinheitlich; Aussagen zu Erkrankungen lassen sich daraus nicht ableiten.',
   src:[['Zaccaro et al. 2018, Frontiers in Human Neuroscience','10.3389/fnhum.2018.00353']]},
  {id:'lippen', name:'Lippenbremse', short:'Lippenbremse',
   desc:'Durch die Nase ein, durch locker aufeinanderliegende Lippen doppelt so lange aus. Eine bekannte Technik aus der Atemphysiotherapie.',
   steps:['Zwei Sekunden durch die Nase einatmen.','Die Lippen locker aufeinanderlegen, als wolltest du sanft eine Kerze flackern lassen.','Vier Sekunden gegen den leichten Widerstand der Lippen ausatmen.','Nicht pressen, die Ausatmung bleibt mühelos.'],
   phases:[['Einatmen',2,1],['Ausatmen',4,.55]],
   level:'Cochrane-Review · COPD',
   ev:'Ein Cochrane-Review (16 Studien, 1.233 Teilnehmende mit COPD) fand nach vier bis 15 Wochen Atemübungen eine bessere Gehstrecke; für die Lippenbremse allein stammt dieser Befund aus einer einzelnen Studie. Auf Atemnot und Lebensqualität zeigten sich keine einheitlichen Effekte. Nebenwirkungen wurden nicht berichtet.',
   src:[['Holland et al. 2012, Cochrane Database of Systematic Reviews','10.1002/14651858.CD008250.pub2']]},
  {id:'bauch', name:'Bauchatmung', short:'Bauchatmung',
   desc:'Die Atembewegung wandert in den Bauch. Eine Hand liegt auf dem Bauch, eine auf der Brust.',
   steps:['Eine Hand auf den Bauch, eine auf die Brust legen.','Drei Sekunden durch die Nase einatmen; die Bauchhand hebt sich, die Brusthand bleibt fast ruhig.','Vier Sekunden entspannt ausatmen.','Mit der Zeit kann die Ausatmung länger werden.'],
   phases:[['Einatmen',3,1],['Ausatmen',4,.55]],
   level:'Cochrane-Review · Asthma',
   ev:'Ein Cochrane-Review zu Atemübungen bei Erwachsenen mit Asthma (22 Studien, 2.880 Teilnehmende, überwiegend Yoga-Atmung) fand eine moderat gesicherte Verbesserung der Lebensqualität nach drei Monaten. Bei Asthmasymptomen und dem Einsekundenvolumen war das Ergebnis nicht eindeutig. Zur Zwerchfellatmung allein gab es nur eine Studie.',
   src:[['Santino et al. 2020, Cochrane Database of Systematic Reviews','10.1002/14651858.CD001277.pub4']]},
  {id:'box', name:'Box-Atmung', short:'Box 4-4-4-4',
   desc:'Vier gleich lange Phasen: einatmen, halten, ausatmen, halten. Viele nutzen sie zum Sammeln vor einer Anspannung.',
   steps:['Vier Sekunden einatmen.','Vier Sekunden die Luft locker halten.','Vier Sekunden ausatmen.','Vier Sekunden leer halten, dann von vorn.'],
   phases:[['Einatmen',4,1],['Halten',4,1],['Ausatmen',4,.55],['Halten',4,.55]],
   level:'Erfahrungswert',
   ev:'Zur Box-Atmung als eigener Technik gibt es kaum kontrollierte Studien. Sie wird aus Erfahrung genutzt. Mit Atemwegserkrankung oder Herzproblemen die Haltephasen weglassen oder kürzen.',
   src:[]}];
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
  renderQR();
  const t = curDays()[todayIndex()];
  $('d-air').textContent = 'Letzte Aktualisierung: ' + new Date(AIR.updated).toLocaleString('de-AT',{dateStyle:'medium',timeStyle:'short'}) + ' · '+PLACES.length+' Orte' + (t?' · '+curPlace().name+' heute Index '+t.aqi_max+' ('+band(t.aqi_max).name+')':'');
}
function readForm(){
  for(const id in F){ const [a,b]=F[id]; STATE[a] = STATE[a] || {}; STATE[a][b] = $(id).value.trim(); }
  STATE.appLink = $('d-link').value.trim();
  STATE.storeUrl = $('d-store').value.trim();
  STATE.partner.showHints = $('d-p-showhints').checked;
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
function renderAll(){ renderToday(); renderCopd(); renderAsthma(); renderAllergy(); }
window.__AW.rerender = () => { renderAll(); renderPlaces(); };
window.__AW.setPlace = (id, auto) => setPlace(id, auto);
window.__AW.setState = (st) => {
  if(!st) return;
  if(st.tip) STATE.tip = st.tip; if(st.partner) STATE.partner = st.partner; if(st.appLink) STATE.appLink = st.appLink;
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
    : 'Dein Browser blockiert den Standort für diese Seite. Erlauben: auf das Schloss- oder Einstellungs-Symbol links neben der Adresse tippen › Standort › Zulassen, dann die Seite neu laden.';
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

renderToday(); renderContent(); renderEx(); renderCopd(); renderAsthma(); renderAllergy(); renderHint('atmen','Lust auf eine längere Atempause?'); show(location.hash.slice(1));
initGeo();
initAdmin();
try{ if(window.__AW_RUNNING) localStorage.setItem('aw-boot-ok', window.__AW_RUNNING); }catch(e){}
return { rerender: () => window.__AW.rerender(), setState: st => window.__AW.setState(st), replaceAir: air => { PLACES.splice(0, PLACES.length, ...air.places); AIR.updated = air.updated; window.__AW.rerender(); } };
}
