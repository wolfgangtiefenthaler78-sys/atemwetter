/* Atemwetter – Android-Anbindung: Live-Daten für den GPS-Standort (GeoSphere Austria, CC BY 4.0),
   Standort, Teilen, externe Links und automatische Übernahme neuer Programmversionen von der Website.
   Inhalte und Tagesdaten kommen aus der Datenbank (src/data.js). Im Browser inaktiv. */
import { SITE_URL } from './config.js';
export function initNative(){
  const C = window.Capacitor;
  if(!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform())) return;
  const SHELL = window.__AW_SHELL || 0;
  const BASE = 'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/';
  const TZ = 'Europe/Vienna';
  const FRESH_MS = 45 * 60 * 1000;
  // EEA-Bänder (Revision 2024, Stundenwerte), Obergrenzen je Kategorie in µg/m³
  const BANDS = {pm25:[5,15,50,90,140,800], pm10:[15,45,120,195,270,1200], no2:[10,25,60,100,150,1000], o3:[60,100,120,160,180,800]};
  const PMAP = {pm25:'pm25surf', pm10:'pm10surf', no2:'no2surf', o3:'o3surf'};
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

  async function fetchDays(lat, lon){
    const ll = 'lat_lon=' + lat.toFixed(4) + ',' + lon.toFixed(4), st = startUtc();
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

  const LS = { get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} } };
  async function refresh(place, force){
    if(!place) return;
    const key = 'aw-live-' + place.id, cached = LS.get(key);
    if(cached && cached.lat === place.lat && cached.lon === place.lon && !place.updated){ place.days = cached.days; place.updated = cached.updated; }
    if(!force && place.updated && Date.now() - new Date(place.updated).getTime() < FRESH_MS) return;
    try {
      const days = await fetchDays(place.lat, place.lon);
      if(days.length){ const old = place.days || []; days.forEach(d => { const o = old.find(x => x.date === d.date); if(o){ d.pollen = o.pollen; d.pollen_hourly = o.pollen_hourly; } }); place.days = days; place.updated = new Date().toISOString(); LS.set(key, {lat:place.lat, lon:place.lon, days, updated:place.updated}); }
    } catch(e){ console.warn('Live-Daten nicht erreichbar', e); }
    if(window.__AW) window.__AW.rerender();
  }
  function distKm(a,b,c,d){ const R=6371, t=x=>x*Math.PI/180; const h=Math.sin(t(c-a)/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(t(d-b)/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }

  window.__AWNative = {
    onPlace(place){ refresh(place, false); },
    async onPosition(lat, lon, statusEl){
      const AW = window.__AW; if(!AW) return;
      let near = null, nd = 1e9; AW.PLACES.forEach(p=>{ if(p.id==='gps') return; const d = distKm(lat,lon,p.lat,p.lon); if(d<nd){ nd=d; near=p; } });
      let gps = AW.PLACES.find(p=>p.id==='gps');
      if(!gps){ gps = {id:'gps', region:'Dein Standort', elev:0, days: near ? near.days : []}; AW.PLACES.unshift(gps); }
      Object.assign(gps, {name: near && nd < 25 ? 'Bei ' + near.name : 'Mein Standort', lat, lon, updated:null});
      if(statusEl){ statusEl.className='status'; statusEl.textContent = 'Live-Daten für deinen Standort werden geladen …'; }
      try {
        const days = await fetchDays(lat, lon); gps.days = days; gps.updated = new Date().toISOString(); gps.nearId = near && near.id;
        if(near) days.forEach(d => { const nd2 = (near.days || []).find(x => x.date === d.date); if(nd2){ d.pollen = nd2.pollen; d.pollen_hourly = nd2.pollen_hourly; } });
        if(statusEl) statusEl.textContent = 'Live-Daten für deinen genauen Standort' + (near && nd < 25 ? ' (bei ' + near.name + ')' : '') + '.';
      } catch(e){
        if(statusEl){ statusEl.className='status'; statusEl.textContent = near ? 'Standort erkannt. Angezeigt wird der nächste Ort: ' + near.name + ' (etwa ' + Math.max(1, Math.round(nd)) + ' km). Live-Daten für den genauen Punkt sind gerade nicht erreichbar.' : 'Für deinen Standort gibt es gerade keine Daten.'; }
        if(near){ AW.setPlace(near.id, true); return; }
      }
      AW.setPlace('gps', true);
    },
    async getPosition(ok, fail, opts){
      const o = Object.assign({enableHighAccuracy:false, timeout:15000, maximumAge:1800000}, opts || {});
      const G = cap().Geolocation;
      if(!G){ navigator.geolocation.getCurrentPosition(ok, fail, o); return; }
      const why = e => String(e && (e.code ? e.code + ' ' : '') + (e && e.message || e || ''));
      try {
        let perm = await G.checkPermissions();
        if(perm.location !== 'granted' && perm.coarseLocation !== 'granted') perm = await G.requestPermissions({permissions:['location','coarseLocation']});
        if(perm.location !== 'granted' && perm.coarseLocation !== 'granted') return fail({code:1, detail:'Berechtigung: ' + perm.location});
      } catch(e){
        if(/disabled|not enabled|services/i.test(why(e))) return fail({code:2, detail:why(e)});
      }
      G.getCurrentPosition(o)
        .then(p => ok({coords:{latitude:p.coords.latitude, longitude:p.coords.longitude}}))
        .catch(e => { const t = why(e); fail({code: /denied|permission/i.test(t) ? 1 : (/time ?out|timeout/i.test(t) ? 3 : 2), detail:t}); });
    },
    share(url){
      const S = cap().Share;
      if(S) S.share({title:'Atemwetter', text:'Luftqualität, Pollen-Kalender und Atemübungen für deinen Ort', url, dialogTitle:'Atemwetter weiterempfehlen'}).catch(()=>{});
    }
  };

  /* ---- Neue Programmversionen von der Website (version.json + app.html) ---- */
  const raw = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
  function bar(text, action){
    let el = document.getElementById('aw-bar');
    if(!el){ el = document.createElement('div'); el.id = 'aw-bar'; el.className = 'hint'; el.setAttribute('role','status');
      el.style.cssText = 'position:fixed;left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:30;width:auto;box-shadow:0 6px 24px rgba(0,0,0,.18)';
      document.body.appendChild(el); }
    el.innerHTML = ''; const t = document.createElement('span'); t.textContent = text; el.appendChild(t);
    if(action){ const b = document.createElement('button'); b.type = 'button'; b.className = 'linkish'; b.textContent = action[0]; b.addEventListener('click', action[1]); el.appendChild(b); }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label','Hinweis schließen'); x.addEventListener('click', () => el.remove()); el.appendChild(x);
  }
  async function checkUpdate(){
    if(!SITE_URL) return;
    try {
      const base = SITE_URL.replace(/\/?$/, '/');
      const v = await (await fetch(base + 'version.json?t=' + Date.now())).json();
      if(v.minShell && v.minShell > SHELL){
        bar('Für alle Neuerungen bitte die App im Play Store aktualisieren.', v.storeUrl ? ['Zum Play Store', () => { location.href = v.storeUrl; }] : null);
        return;
      }
      const running = window.__AW_RUNNING;
      if(!v.version || v.version === running || v.version === raw.get('aw-bundle-v') || v.version === raw.get('aw-bundle-bad')) return;
      const html = await (await fetch(base + 'app.html?v=' + v.version)).text();
      if(html.indexOf('<title>Atemwetter') < 0 || html.indexOf('aw-root') < 0) throw new Error('ungültig');
      raw.set('aw-bundle', html); raw.set('aw-bundle-v', v.version); raw.set('aw-bundle-base', window.__AW_BUILTIN || '');
      bar('Eine neue Version von Atemwetter ist bereit.', ['Jetzt neu laden', () => location.reload()]);
    } catch(e){ console.warn('Update-Prüfung nicht möglich', e); }
  }

  // Externe Links im System-Browser öffnen
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="http"]');
    if(a){ e.preventDefault(); window.location.href = a.href; }
  }, true);

  // Beim Start und beim Zurückkehren in die App aktuelle Daten holen
  let lastSync = 0;
  const kick = () => {
    if(!window.__AW) return;
    refresh(window.__AW.curPlace(), false);
    if(Date.now() - lastSync > 30 * 60 * 1000){ lastSync = Date.now(); checkUpdate(); }
  };
  if(document.readyState === 'complete') setTimeout(kick, 50); else window.addEventListener('load', () => setTimeout(kick, 50));
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') kick(); });
}
