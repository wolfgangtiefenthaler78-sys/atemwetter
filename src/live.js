/* Atemwetter – Live-Daten für einen genauen Standort (GeoSphere Austria, CC BY 4.0).
   Genutzt von der Android-App und von der Website, wenn „Meinen Standort verwenden“ gewählt ist.
   Luft: chem-v2-1h-3km, außerhalb chem-v2-1h-9km (Europa); Wetter: nwp-v2-1h-1km (bis ca. 51,5° N). */
const BASE = 'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/';
const TZ = 'Europe/Vienna';
// EEA-Bänder (Revision 2024, Stundenwerte), Obergrenzen je Kategorie in µg/m³
const BANDS = {pm25:[5,15,50,90,140,800], pm10:[15,45,120,195,270,1200], no2:[10,25,60,100,150,1000], o3:[60,100,120,160,180,800]};
const cap = () => (window.Capacitor && window.Capacitor.Plugins) || {};

function sub(k, c){
  if(c == null) return null;
  let lo = 0; const b = BANDS[k];
  for(let i = 0; i < b.length; i++){ const hi = b[i]; if(c <= hi || i === b.length - 1) return Math.round(i*20 + 20*Math.min(1, (c-lo)/(hi-lo))); lo = hi; }
}
function local(ts){
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'}).formatToParts(new Date(ts)).map(x=>[x.type, x.value]));
  return {date: p.year+'-'+p.month+'-'+p.day, hour: Number(p.hour)};
}
function startUtc(){
  // heutiges Datum 00:00 Ortszeit Wien, als UTC-Zeitpunkt
  const now = new Date(); const l = local(now.toISOString());
  for(let h = -3; h <= 3; h++){ const c = new Date(Date.UTC(+l.date.slice(0,4), +l.date.slice(5,7)-1, +l.date.slice(8,10), h, 0));
    const x = local(c.toISOString()); if(x.date === l.date && x.hour === 0) return c.toISOString().slice(0,16); }
  return now.toISOString().slice(0,11) + '00:00';
}
async function getJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const r1 = x => x == null ? 0 : Math.round(x*10)/10;

export async function fetchDays(lat, lon){
  // Datenschutz: nur auf 0,01° (rund 1 km) gerundet weitergeben – das Modellgitter ist ohnehin 1–9 km grob
  const ll = 'lat_lon=' + lat.toFixed(2) + ',' + lon.toFixed(2), st = startUtc();
  const CP = 'parameters=pm25surf,pm10surf,no2surf,o3surf&' + ll + '&start=' + st + '&output_format=geojson';
  // Luft: 3-km-Modell, außerhalb davon (z. B. Norddeutschland) das europaweite 9-km-Modell
  let chem; try { chem = await getJSON(BASE + 'chem-v2-1h-3km?' + CP); } catch(e){ chem = await getJSON(BASE + 'chem-v2-1h-9km?' + CP); }
  // Wetter für den Luftaustausch: nur im Gebiet von nwp-v2-1h-1km (bis ca. 51,5° N), sonst ohne
  let nwp = null; try { nwp = await getJSON(BASE + 'nwp-v2-1h-1km?parameters=2t,2r,10u,10v&' + ll + '&start=' + st + '&output_format=geojson'); }
  catch(e){ try { nwp = await getJSON(BASE + 'nwp-v2-1h-1km?parameters=2t,2r,10u,10v&' + ll + '&output_format=geojson'); } catch(e2){ nwp = null; } }
  const P = chem.features[0].properties.parameters, N = nwp ? nwp.features[0].properties.parameters : {};
  const W = {u10m: N['10u'] || N.u10m, v10m: N['10v'] || N.v10m, rh2m: N['2r'] || N.rh2m, t2m: N['2t'] || N.t2m};
  const hours = {}, met = {};
  chem.timestamps.forEach((ts,i)=>{ const t = local(ts); (hours[t.date] = hours[t.date] || {})[t.hour] = {pm25:P.pm25surf.data[i], pm10:P.pm10surf.data[i], no2:P.no2surf.data[i], o3:P.o3surf.data[i]}; });
  (nwp ? nwp.timestamps : []).forEach((ts,i)=>{ const t = local(ts), u = W.u10m.data[i], v = W.v10m.data[i];
    (met[t.date] = met[t.date] || {})[t.hour] = {wind: (u==null||v==null) ? null : Math.hypot(u,v), rh: W.rh2m.data[i], t2m: W.t2m.data[i]}; });
  return Object.keys(hours).sort().slice(0,3).map(d=>{
    const hh = hours[d], vals = Object.values(hh);
    const m = k => r1(mean(vals.map(h=>h[k]).filter(x=>x!=null)));
    const aqi = []; for(let h = 0; h < 24; h++){ const x = hh[h]; aqi.push(x ? Math.max(...Object.keys(BANDS).map(k=>sub(k, x[k])).filter(y=>y!=null)) : null); }
    const valid = aqi.filter(x=>x!=null), mm = met[d] || {};
    const morning = [6,7,8,9,10].map(h=>mm[h]).filter(x=>x && x.wind!=null);
    let inv = null;
    if(morning.length){ const wind = mean(morning.map(x=>x.wind)), rh = mean(morning.map(x=>x.rh)); const t7 = (mm[7] || morning[0]).t2m;
      inv = {level: (wind < 1.5 && rh >= 88) ? 'stark' : (wind < 2.5 ? 'leicht' : 'keine'), wind: r1(wind), rh: Math.round(rh), t2m: t7}; }
    return {date:d, aqi_max: valid.length ? Math.max(...valid) : 0, pm25:m('pm25'), pm10:m('pm10'), no2:m('no2'),
            o3_max: r1(Math.max(0, ...vals.map(h=>h.o3).filter(x=>x!=null))), pollen:null, inversion:inv, aqi_hourly:aqi};
  });
}

export function distKm(a,b,c,d){ const R=6371, t=x=>x*Math.PI/180; const h=Math.sin(t(c-a)/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(t(d-b)/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }

// Legt den Eintrag „Mein Standort“ an, lädt die Live-Daten und zeigt ihn an. Pollen (regional) vom nächsten Ort bis 40 km.
export async function showPosition(lat, lon, statusEl){
  const AW = window.__AW; if(!AW) return;
  let near = null, nd = 1e9; AW.PLACES.forEach(p=>{ if(p.id==='gps') return; const d = distKm(lat,lon,p.lat,p.lon); if(d<nd){ nd=d; near=p; } });
  let gps = AW.PLACES.find(p=>p.id==='gps');
  if(!gps){ gps = {id:'gps', region:'Dein Standort', elev:0, days: near ? near.days : []}; AW.PLACES.unshift(gps); }
  Object.assign(gps, {name: near && nd < 25 ? 'Bei ' + near.name : 'Mein Standort', lat, lon, updated:null});
  if(statusEl){ statusEl.className='status'; statusEl.textContent = 'Live-Daten für deinen Standort werden geladen …'; }
  try {
    const days = await fetchDays(lat, lon); gps.days = days; gps.updated = new Date().toISOString(); gps.nearId = near && near.id;
    if(near && nd < 40) days.forEach(d => { const nd2 = (near.days || []).find(x => x.date === d.date); if(nd2){ d.pollen = nd2.pollen; d.pollen_hourly = nd2.pollen_hourly; } });
    if(statusEl) statusEl.textContent = 'Live-Daten für deinen genauen Standort' + (near && nd < 25 ? ' (bei ' + near.name + ')' : '') + '.';
  } catch(e){
    if(statusEl){ statusEl.className='status'; statusEl.textContent = near ? 'Standort erkannt. Angezeigt wird der nächste Ort: ' + near.name + ' (etwa ' + Math.max(1, Math.round(nd)) + ' km). Live-Daten für den genauen Punkt sind gerade nicht erreichbar.' : 'Für deinen Standort gibt es gerade keine Daten.'; }
    if(near){ AW.setPlace(near.id, true); return; }
  }
  AW.setPlace('gps', true);
}
