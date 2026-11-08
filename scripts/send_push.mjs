// Atemwetter – Morgen-Mitteilung im Browser (Web-Push) verschicken. Läuft als GitHub-Action (.github/workflows/push.yml).
// Schickt je Anmeldung nur die Tageswerte des Ortes; den persönlichen Tipp setzt der Service Worker auf dem Gerät zusammen.
// Aufruf: node scripts/send_push.mjs           – fällige Mitteilungen senden
//         node scripts/send_push.mjs --setup   – nur Schlüsselpaar (VAPID) anlegen, falls noch keines existiert
// Umgebung: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (GitHub-Secrets)
import webpush from 'web-push';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if(!URL_ || !KEY) { console.error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt'); process.exit(1); }
const H = { apikey: KEY, 'Content-Type': 'application/json' };
if(KEY.startsWith('eyJ')) H.Authorization = 'Bearer ' + KEY;   // alter JWT-Schlüssel; neue sb_secret_-Schlüssel nur im apikey-Kopf

async function rest(path, opts = {}){
  const r = await fetch(URL_ + '/rest/v1/' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if(!r.ok) throw new Error(path.split('?')[0] + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

async function vapid(){
  const rows = await rest('app_secrets?select=name,value&name=in.(vapid_public,vapid_private)');
  let pub = (rows.find(r => r.name === 'vapid_public') || {}).value, priv = (rows.find(r => r.name === 'vapid_private') || {}).value;
  if(!pub || !priv){
    const k = webpush.generateVAPIDKeys(); pub = k.publicKey; priv = k.privateKey;
    await rest('app_secrets', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ name: 'vapid_public', value: pub }, { name: 'vapid_private', value: priv }]) });
    console.log('Neues Schlüsselpaar für Mitteilungen angelegt.');
  }
  // öffentlichen Teil für die App bereitstellen
  await rest('content?id=eq.main', { method: 'PATCH', body: JSON.stringify({ push_public_key: pub }) });
  return { pub, priv };
}

const { pub, priv } = await vapid();
if(process.argv.includes('--setup')) { console.log('Schlüssel bereit.'); process.exit(0); }
webpush.setVapidDetails('https://wolfgangtiefenthaler78-sys.github.io/atemwetter/', pub, priv);

const now = new Date();
const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Europe/Vienna', hour: '2-digit', hour12: false })) % 24;
const subs = await rest('push_subscriptions?select=endpoint,p256dh,auth,place_id,hour,last_sent&hour=lte.' + hour + '&or=(last_sent.is.null,last_sent.lt.' + today + ')');
console.log('Wien', today, hour + ' Uhr –', subs.length, 'fällige Mitteilungen');
if(!subs.length) process.exit(0);

const ids = [...new Set(subs.map(s => s.place_id))];
const places = await rest('places?select=id,name&id=in.(' + ids.map(encodeURIComponent).join(',') + ')');
const days = await rest('air_days?select=place_id,date,aqi_max,pm25,pm10,no2,o3_max,inversion,pollen,pollen_hourly&date=eq.' + today + '&place_id=in.(' + ids.map(encodeURIComponent).join(',') + ')');
const nameOf = Object.fromEntries(places.map(p => [p.id, p.name]));
const dayOf = Object.fromEntries(days.map(d => [d.place_id, d]));

let ok = 0, gone = 0, fail = 0;
for(const s of subs){
  const d = dayOf[s.place_id];
  const day = d ? { date: d.date, aqi_max: d.aqi_max, pm25: d.pm25, pm10: d.pm10, no2: d.no2, o3_max: d.o3_max, inversion: d.inversion, pollen: d.pollen, pollen_hourly: d.pollen_hourly } : null;
  const payload = JSON.stringify({ t: 'daily', date: today, place: { id: s.place_id, name: nameOf[s.place_id] || '' }, day });
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 4 * 3600, urgency: 'normal' });
    await rest('push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint), { method: 'PATCH', body: JSON.stringify({ last_sent: today }) });
    ok++;
  } catch(e){
    if(e.statusCode === 404 || e.statusCode === 410){   // Browser hat die Anmeldung aufgehoben
      await rest('push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint), { method: 'DELETE' }); gone++;
    } else { fail++; console.warn('Senden fehlgeschlagen:', e.statusCode || '', (e.body || e.message || '').toString().slice(0, 150)); }
  }
}
console.log('gesendet', ok, '· abgemeldet', gone, '· Fehler', fail);
