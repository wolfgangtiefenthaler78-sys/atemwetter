/* Atemwetter – Morgen-Mitteilung mit dem persönlichen Tagestipp, für alle Anwendungen:
   - Android- und iPhone-App: Mitteilungen werden auf dem Gerät für die nächsten Morgen geplant
     (Erweiterung LocalNotifications). Ältere App-Versionen ohne diese Erweiterung: Hinweis zum Aktualisieren.
   - Browser (PC, Android-Chrome, iPhone am Home-Bildschirm): Web-Push. Gespeichert werden auf dem Server nur
     die technische Empfangsadresse des Browsers, der Ort und die Uhrzeit. Profil und Allergien bleiben auf dem Gerät.
   - Wo keine Mitteilung möglich ist: Tagestipp beim ersten Öffnen am Tag als Einblendung in der App. */
import { dailyTip } from './tips.js';

const KEY = 'aw-dtip';
const NOTE_IDS = [101, 102, 103, 104, 105, 106, 107];
const cap = () => window.Capacitor || null;

export function loadSettings(){
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if(s && typeof s === 'object') return { on: !!s.on, hour: Number(s.hour) || 7 }; } catch(e){}
  return { on: false, hour: 7 };
}
export function saveSettings(s){ try { localStorage.setItem(KEY, JSON.stringify({ on: !!s.on, hour: s.hour })); } catch(e){} }

/** Welche Art von Mitteilung auf diesem Gerät möglich ist. */
export function platform(){
  const C = cap();
  if(C && C.isNativePlatform && C.isNativePlatform()) return C.isPluginAvailable && C.isPluginAvailable('LocalNotifications') ? 'native' : 'native-old';
  if('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'web';
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'ios-browser';
  return 'none';
}

/* ---- Einstellungen für den Service Worker (IndexedDB, bleibt auf dem Gerät) ---- */
function idbSet(key, val){
  return new Promise(res => {
    try {
      const r = indexedDB.open('aw', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { try { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch(e){ res(false); } };
      r.onerror = () => res(false);
    } catch(e){ res(false); }
  });
}

const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const localIso = d => d.toLocaleDateString('sv-SE');

/**
 * @param ctx { api, pushKey(), place(), serverPlaceId(), days(), prefs() }
 */
export function createNotifier(ctx){
  const LN = () => cap().Plugins.LocalNotifications;

  async function scheduleNative(s){
    const ln = LN();
    try { await ln.cancel({ notifications: NOTE_IDS.map(id => ({ id })) }); } catch(e){}
    if(!s.on) return;
    const place = ctx.place(), days = ctx.days(), prefs = ctx.prefs(), now = new Date(), notes = [];
    NOTE_IDS.forEach((id, k) => {
      const at = new Date(); at.setDate(at.getDate() + k); at.setHours(s.hour, 0, 0, 0);
      if(at <= now) return;
      const d = days.find(x => x.date === localIso(at));
      let title = 'Dein Atemwetter', body = 'Öffne Atemwetter für deinen Tagestipp: Luft, Pollen und eine passende Atemübung.';
      if(d){ const t = dailyTip(d, prefs, place.name); title = t.title + ' · ' + place.name; body = t.text; }
      notes.push({ id, title, body, largeBody: body, schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_atemwetter', iconColor: '#2f5d8a', extra: { view: 'heute' } });
    });
    if(notes.length) await ln.schedule({ notifications: notes });
  }

  async function webSub(){
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function saveWeb(s){
    await idbSet('prefs', ctx.prefs());
    const sub = await webSub(); if(!sub) return false;
    const j = sub.toJSON();
    await ctx.api.savePush(j.endpoint, j.keys.p256dh, j.keys.auth, ctx.serverPlaceId(), s.hour);
    return true;
  }

  return {
    platform,
    /** Einschalten; liefert eine Statusmeldung oder wirft einen Fehler mit verständlichem Text. */
    async enable(s){
      const pf = platform();
      if(pf === 'native'){
        const p = await LN().requestPermissions();
        if(p.display !== 'granted') throw new Error('Mitteilungen sind für Atemwetter nicht erlaubt. Erlauben in den Einstellungen des Handys › Apps › Atemwetter › Mitteilungen.');
        await scheduleNative(s);
        return 'Eingeschaltet. Dein Tagestipp kommt jeden Morgen um ' + s.hour + ':00 Uhr.';
      }
      if(pf === 'web'){
        const key = ctx.pushKey();
        if(!key || !ctx.api.enabled) throw new Error('Mitteilungen sind gerade nicht verfügbar. Bitte später nochmals versuchen.');
        const perm = await Notification.requestPermission();
        if(perm !== 'granted') throw new Error('Der Browser hat Mitteilungen blockiert. Erlauben: auf das Schloss- oder Einstellungs-Symbol neben der Adresse tippen › Mitteilungen › Zulassen.');
        const reg = await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
        await saveWeb(s);
        return 'Eingeschaltet. Dein Tagestipp kommt jeden Morgen gegen ' + s.hour + ':00 Uhr, auch wenn Atemwetter geschlossen ist.';
      }
      return 'Eingeschaltet. Dein Tagestipp erscheint jeden Morgen beim ersten Öffnen von Atemwetter.';
    },
    async disable(){
      const pf = platform();
      if(pf === 'native'){ try { await LN().cancel({ notifications: NOTE_IDS.map(id => ({ id })) }); } catch(e){} }
      if(pf === 'web'){
        const sub = await webSub();
        if(sub){ const ep = sub.endpoint; try { await sub.unsubscribe(); } catch(e){} try { await ctx.api.deletePush(ep); } catch(e){} }
      }
    },
    /** Nach Änderungen an Ort, Daten oder Einstellungen: Planung bzw. Anmeldung auffrischen. */
    async refresh(s){
      if(!s.on) return;
      const pf = platform();
      try {
        if(pf === 'native') await scheduleNative(s);
        if(pf === 'web' && Notification.permission === 'granted') await saveWeb(s);
      } catch(e){ console.warn('Tagestipp-Mitteilung nicht aktualisiert', e); }
    },
    /** true, wenn auf diesem Gerät eine echte Mitteilung ankommt (sonst: Einblendung in der App). */
    systemReady(){
      const pf = platform();
      return pf === 'native' || (pf === 'web' && 'Notification' in window && Notification.permission === 'granted');
    },
    onTap(cb){
      if(platform() !== 'native') return;
      try { LN().addListener('localNotificationActionPerformed', () => cb()); } catch(e){}
    }
  };
}
