/* Atemwetter – Android-Anbindung: Live-Daten für den GPS-Standort (GeoSphere Austria, CC BY 4.0),
   Standort, Teilen, externe Links und automatische Übernahme neuer Programmversionen von der Website.
   Inhalte und Tagesdaten kommen aus der Datenbank (src/data.js). Im Browser inaktiv. */
import { SITE_URL } from './config.js';
import { fetchDays, distKm, showPosition } from './live.js';
export function initNative(){
  const C = window.Capacitor;
  if(!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform())) return;
  const SHELL = window.__AW_SHELL || 0;
  const FRESH_MS = 45 * 60 * 1000;

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

  window.__AWNative = {
    onPlace(place){ refresh(place, false); },
    onPosition: showPosition,
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
      const ios = C.getPlatform && C.getPlatform() === 'ios';
      const appUpdate = () => {   // neue App-Version über die bestehende installieren – Einstellungen bleiben erhalten
        const url = ios ? v.iosStoreUrl : (v.storeUrl || v.apkUrl);
        if(url) location.href = url;   // öffnet Play Store bzw. lädt die App-Datei im Browser; Android bietet dann „Aktualisieren“ an
      };
      if(v.minShell && v.minShell > SHELL){
        bar('Für alle Neuerungen bitte die App aktualisieren. Deine Einstellungen bleiben erhalten.', (ios ? v.iosStoreUrl : (v.storeUrl || v.apkUrl)) ? ['Jetzt aktualisieren', appUpdate] : null);
        return;
      }
      let shellBar = false;
      if(v.shell && v.shell > SHELL && raw.get('aw-shell-ask') !== new Date().toLocaleDateString('sv-SE') && (ios ? v.iosStoreUrl : (v.storeUrl || v.apkUrl))){
        raw.set('aw-shell-ask', new Date().toLocaleDateString('sv-SE')); shellBar = true;
        bar('Neue App-Version mit Morgen-Mitteilungen verfügbar. Das Update dauert eine Minute, deine Einstellungen bleiben erhalten.', ['Jetzt aktualisieren', appUpdate]);
      }
      const running = window.__AW_RUNNING;
      if(!v.version || v.version === running || v.version === raw.get('aw-bundle-v') || v.version === raw.get('aw-bundle-bad')) return;
      const html = await (await fetch(base + 'app.html?v=' + v.version)).text();
      if(html.indexOf('<title>Atemwetter') < 0 || html.indexOf('aw-root') < 0) throw new Error('ungültig');
      raw.set('aw-bundle', html); raw.set('aw-bundle-v', v.version); raw.set('aw-bundle-base', window.__AW_BUILTIN || '');
      if(!shellBar) bar('Eine neue Version von Atemwetter ist bereit.', ['Jetzt neu laden', () => location.reload()]);   // sonst beim nächsten Start
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
