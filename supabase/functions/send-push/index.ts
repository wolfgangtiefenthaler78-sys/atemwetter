// Atemwetter – Morgen-Mitteilung im Browser (Web-Push) verschicken.
// Läuft als Supabase Edge Function und wird von pg_cron alle 10 Minuten aufgerufen
// (Migration 20261109100000_push_cron.sql). Zuverlässiger als die Zeitsteuerung von GitHub.
// Schickt je Anmeldung nur die Tageswerte des Ortes; den persönlichen Tipp setzt der Service Worker auf dem Gerät zusammen.
// Schutz: Aufruf nur mit dem Kopf „x-cron-key“, dessen Wert in app_secrets (name = 'cron_key') steht.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://wolfgangtiefenthaler78-sys.github.io/atemwetter/";

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec, error: e0 } = await sb.from("app_secrets").select("name,value").in("name", ["vapid_public", "vapid_private", "cron_key"]);
  if (e0) return json({ error: "Schlüssel nicht lesbar" }, 500);
  const val = (n: string) => (sec || []).find((r) => r.name === n)?.value || "";
  const cronKey = val("cron_key");
  if (!cronKey || req.headers.get("x-cron-key") !== cronKey) return json({ error: "nicht erlaubt" }, 401);
  const pub = val("vapid_public"), priv = val("vapid_private");
  if (!pub || !priv) return json({ error: "kein Schlüsselpaar" }, 500);
  webpush.setVapidDetails(SITE, pub, priv);

  const now = new Date();
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
  const hour = Number(now.toLocaleString("en-GB", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })) % 24;
  const { data: subs, error: e1 } = await sb.from("push_subscriptions")
    .select("endpoint,p256dh,auth,place_id,hour,last_sent")
    .lte("hour", hour).or("last_sent.is.null,last_sent.lt." + today);
  if (e1) return json({ error: e1.message }, 500);
  if (!subs || !subs.length) return json({ today, hour, due: 0 });

  const ids = [...new Set(subs.map((s) => s.place_id))];
  const { data: places } = await sb.from("places").select("id,name").in("id", ids);
  const { data: days } = await sb.from("air_days")
    .select("place_id,date,aqi_max,pm25,pm10,no2,o3_max,inversion,pollen,pollen_hourly")
    .eq("date", today).in("place_id", ids);
  const nameOf = Object.fromEntries((places || []).map((p) => [p.id, p.name]));
  const dayOf = Object.fromEntries((days || []).map((d) => [d.place_id, d]));

  let ok = 0, gone = 0, fail = 0;
  for (const s of subs) {
    const d = dayOf[s.place_id];
    const day = d ? { date: d.date, aqi_max: d.aqi_max, pm25: d.pm25, pm10: d.pm10, no2: d.no2, o3_max: d.o3_max, inversion: d.inversion, pollen: d.pollen, pollen_hourly: d.pollen_hourly } : null;
    const payload = JSON.stringify({ t: "daily", date: today, place: { id: s.place_id, name: nameOf[s.place_id] || "" }, day });
    // zuerst als gesendet markieren: verhindert doppelte Mitteilungen, falls zwei Aufrufe gleichzeitig laufen
    const { data: claimed } = await sb.from("push_subscriptions").update({ last_sent: today })
      .eq("endpoint", s.endpoint).or("last_sent.is.null,last_sent.lt." + today).select("endpoint");
    if (!claimed || !claimed.length) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 4 * 3600, urgency: "normal" });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint); gone++; }
      else { await sb.from("push_subscriptions").update({ last_sent: s.last_sent }).eq("endpoint", s.endpoint); fail++; console.warn("Senden fehlgeschlagen", code, String((e as Error).message || "").slice(0, 150)); }
    }
  }
  return json({ today, hour, due: subs.length, sent: ok, gone, fail });
});

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
