/* Atemwetter – Service Worker für die Morgen-Mitteilung im Browser (PC, Android-Chrome, iPhone am Home-Bildschirm).
   Der Server schickt nur die Tageswerte des Ortes; den persönlichen Tipp setzt dieser Service Worker
   mit den Einstellungen zusammen, die nur auf dem Gerät gespeichert sind (IndexedDB). */
import { dailyTip } from './tips.js';

function idbGet(key){
  return new Promise(res => {
    const r = indexedDB.open('aw', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { try { const q = r.result.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch(e){ res(null); } };
    r.onerror = () => res(null);
  });
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let d = {}; try { d = e.data ? e.data.json() : {}; } catch(_){}
    const prefs = (await idbGet('prefs')) || {};
    let title = 'Dein Atemwetter', body = 'Schau dir den Tagestipp für heute an.';
    if(d.day){ const t = dailyTip(d.day, prefs, d.place && d.place.name); title = t.title + (d.place && d.place.name ? ' · ' + d.place.name : ''); body = t.text; }
    await self.registration.showNotification(title, { body, icon: 'icon-192.png', tag: 'aw-daily', lang: 'de', data: { url: './#heute' } });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const c of all){ if(c.url.startsWith(self.registration.scope)){ await c.focus(); if(c.navigate) c.navigate(url).catch(() => {}); return; } }
    await self.clients.openWindow(url);
  })());
});
