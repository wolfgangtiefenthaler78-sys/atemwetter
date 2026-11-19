// Atemwetter – tägliche Luftwerte direkt aus der Datenbank holen (ohne GitHub).
// Läuft als Supabase Edge Function, aufgerufen von pg_cron über trigger_daily_data()
// (Migration 20261119190000_daily_air_function.sql), sobald am Morgen noch keine Daten von heute da sind.
// Gleiche Rechnung wie scripts/fetch_air.py: GeoSphere Austria (CC BY 4.0), Luft chem-v2-1h-3km bzw. -9km,
// Wetter nwp-v2-1h-1km (bis ca. 51,5° N). Schreibt nur Luftspalten – Pollen bleiben unangetastet
// (die kommen weiterhin aus dem GitHub-Lauf mit Copernicus).
// Schutz: Aufruf nur mit dem Kopf „x-cron-key“ (app_secrets.cron_key).
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/";
const TZ = "Europe/Vienna";
const BANDS: Record<string, number[]> = { pm25: [5, 15, 50, 90, 140, 800], pm10: [15, 45, 120, 195, 270, 1200], no2: [10, 25, 60, 100, 150, 1000], o3: [60, 100, 120, 160, 180, 800] };
const NWP_BOX = { latMin: 43.0, latMax: 51.49, lonMin: 5.04, lonMax: 22.56 };   // nwp-v2-1h-1km (EPSG:4326)
const CHEM3_LAT_MAX = 53.6;                                                      // darüber gleich das 9-km-Modell
type Place = { id: string; name: string; lat: number; lon: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
class OutOfBounds extends Error {}

async function get(url: string) {
  let last = "";
  for (const wait of [3000, 10000, 20000, 0]) {
    try {
      const r = await fetch(url);
      const body = await r.text();
      await sleep(250);   // GeoSphere: höchstens 5 Anfragen pro Sekunde
      if (r.ok) return JSON.parse(body);
      if ((r.status === 400 || r.status === 422) && body.includes("outside")) throw new OutOfBounds(body.slice(0, 200));
      last = `HTTP ${r.status} ${body.slice(0, 120)}`;
    } catch (e) {
      if (e instanceof OutOfBounds) throw e;
      last = String(e);
    }
    if (wait) await sleep(wait);
  }
  throw new Error("Abruf fehlgeschlagen: " + last);
}

function startUtc(): string {
  // heute 00:00 Wiener Zeit als UTC-Zeitpunkt
  const now = new Date();
  const d = now.toLocaleDateString("sv-SE", { timeZone: TZ });
  for (let h = -3; h <= 3; h++) {
    const c = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h, 0));
    if (c.toLocaleDateString("sv-SE", { timeZone: TZ }) === d && local(c.toISOString()).hour === 0) return c.toISOString().slice(0, 16);
  }
  return now.toISOString().slice(0, 11) + "00:00";
}
function local(ts: string) {
  const t = new Date(ts);
  return { date: t.toLocaleDateString("sv-SE", { timeZone: TZ }), hour: Number(t.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false })) % 24 };
}
function sub(k: string, c: number | null) {
  if (c == null) return null;
  let lo = 0; const b = BANDS[k];
  for (let i = 0; i < b.length; i++) { const hi = b[i]; if (c <= hi || i === b.length - 1) return Math.round(i * 20 + 20 * Math.min(1, (c - lo) / (hi - lo))); lo = hi; }
  return null;
}
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const r1 = (x: number | null) => x == null ? 0 : Math.round(x * 10) / 10;

// Liefert je Ort [feature, timestamps] oder null (außerhalb des Modellgebiets)
async function features(dataset: string, params: string, pts: Place[], start: string) {
  const one = async (batch: Place[]) => {
    const ll = batch.map((p) => `lat_lon=${p.lat},${p.lon}`).join("&");
    const url = `${BASE}${dataset}?parameters=${params}&${ll}&output_format=geojson`;
    let j;
    try { j = await get(url + "&start=" + start); }
    catch (e) { if (e instanceof OutOfBounds) throw e; j = await get(url); }   // Lauf beginnt erst nach Mitternacht
    return j.features.map((f: unknown) => [f, j.timestamps] as [any, string[]]);
  };
  try { return await one(pts); }
  catch (e) {
    if (!(e instanceof OutOfBounds)) throw e;
    const out: ([any, string[]] | null)[] = [];
    for (const p of pts) { try { out.push(...await one([p])); } catch (e2) { if (e2 instanceof OutOfBounds) out.push(null); else throw e2; } }
    return out;
  }
}

function build(place: Place, chem: [any, string[]], nwp: [any, string[]] | null, updated: string) {
  const P = chem[0].properties.parameters;
  const N = nwp ? nwp[0].properties.parameters : {};
  const W = { u: N["10u"] || N.u10m, v: N["10v"] || N.v10m, rh: N["2r"] || N.rh2m, t: N["2t"] || N.t2m };
  const hours: Record<string, Record<number, Record<string, number | null>>> = {};
  chem[1].forEach((ts, i) => { const t = local(ts); (hours[t.date] ||= {})[t.hour] = { pm25: P.pm25surf.data[i], pm10: P.pm10surf.data[i], no2: P.no2surf.data[i], o3: P.o3surf.data[i] }; });
  const met: Record<string, Record<number, { wind: number | null; rh: number; t2m: number }>> = {};
  (nwp ? nwp[1] : []).forEach((ts, i) => {
    const t = local(ts), u = W.u.data[i], v = W.v.data[i];
    (met[t.date] ||= {})[t.hour] = { wind: u == null || v == null ? null : Math.hypot(u, v), rh: W.rh.data[i], t2m: W.t.data[i] };
  });
  return Object.keys(hours).sort().slice(0, 3).map((d) => {
    const hh = hours[d], vals = Object.values(hh);
    const m = (k: string) => r1(mean(vals.map((h) => h[k]).filter((x): x is number => x != null)));
    const aqi: (number | null)[] = [];
    for (let h = 0; h < 24; h++) { const x = hh[h]; aqi.push(x ? Math.max(...Object.keys(BANDS).map((k) => sub(k, x[k] as number | null)).filter((y): y is number => y != null)) : null); }
    const valid = aqi.filter((x): x is number => x != null), mm = met[d] || {};
    const morning = [6, 7, 8, 9, 10].map((h) => mm[h]).filter((x) => x && x.wind != null);
    let inv = null;
    if (morning.length) {
      const wind = mean(morning.map((x) => x.wind as number))!, rh = mean(morning.map((x) => x.rh))!, t7 = (mm[7] || morning[0]).t2m;
      inv = { level: wind < 1.5 && rh >= 88 ? "stark" : wind < 2.5 ? "leicht" : "keine", wind: r1(wind), rh: Math.round(rh), t2m: t7 };
    }
    return { place_id: place.id, date: d, aqi_max: valid.length ? Math.max(...valid) : 0, pm25: m("pm25"), pm10: m("pm10"), no2: m("no2"),
             o3_max: r1(Math.max(0, ...vals.map((h) => h.o3).filter((x): x is number => x != null))), inversion: inv, aqi_hourly: aqi, updated_at: updated };
  });
}

async function run(sb: ReturnType<typeof createClient>) {
  const { data: places, error } = await sb.from("places").select("id,name,lat,lon").eq("active", true).order("sort");
  if (error || !places) throw new Error("Orte nicht lesbar: " + error?.message);
  const start = startUtc(), updated = new Date().toISOString();
  const rows: unknown[] = [];
  let ok = 0, skipped = 0;
  const near = places.filter((p) => p.lat <= CHEM3_LAT_MAX), far = places.filter((p) => p.lat > CHEM3_LAT_MAX);
  for (const [group, chemSet] of [[near, "chem-v2-1h-3km"], [far, "chem-v2-1h-9km"]] as [Place[], string][]) {
    for (let s = 0; s < group.length; s += 10) {
      const batch = group.slice(s, s + 10);
      let chem = await features(chemSet, "pm25surf,pm10surf,no2surf,o3surf", batch, start);
      if (chemSet.endsWith("3km") && chem.some((c) => c == null)) {   // Randgebiet: Einzelne über das 9-km-Modell
        const miss = batch.filter((_, i) => chem[i] == null);
        const wide = await features("chem-v2-1h-9km", "pm25surf,pm10surf,no2surf,o3surf", miss, start);
        let k = 0; chem = chem.map((c) => c ?? wide[k++]);
      }
      const inBox = batch.filter((p) => p.lat >= NWP_BOX.latMin && p.lat <= NWP_BOX.latMax && p.lon >= NWP_BOX.lonMin && p.lon <= NWP_BOX.lonMax);
      const nwpList = inBox.length ? await features("nwp-v2-1h-1km", "2t,2r,10u,10v", inBox, start) : [];
      batch.forEach((p, i) => {
        const c = chem[i];
        if (!c) { skipped++; return; }
        const j = inBox.indexOf(p);
        rows.push(...build(p, c, j >= 0 ? nwpList[j] : null, updated)); ok++;
      });
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await sb.from("air_days").upsert(rows.slice(i, i + 200), { onConflict: "place_id,date" });
    if (e) throw new Error("Schreiben fehlgeschlagen: " + e.message);
  }
  await sb.rpc("cleanup_air_days", { keep_days: 7 });
  return { ok, skipped, rows: rows.length };
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await sb.from("app_secrets").select("value").eq("name", "cron_key").maybeSingle();
  if (!sec?.value || req.headers.get("x-cron-key") !== sec.value) return new Response(JSON.stringify({ error: "nicht erlaubt" }), { status: 401 });
  const job = run(sb)
    .then((r) => sb.from("app_secrets").upsert({ name: "daily_air_result", value: new Date().toISOString() + " ok " + JSON.stringify(r) }))
    .catch((e) => sb.from("app_secrets").upsert({ name: "daily_air_result", value: new Date().toISOString() + " Fehler " + String(e).slice(0, 300) }));
  // Antwort sofort, Arbeit läuft im Hintergrund weiter
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(job);
  if (!(globalThis as any).EdgeRuntime) await job;
  return new Response(JSON.stringify({ started: true }), { status: 202, headers: { "Content-Type": "application/json" } });
});
