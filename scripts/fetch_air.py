#!/usr/bin/env python3
"""Atemwetter: holt Luftgüte- und Wetterprognosen für eine feste Ortsliste
von GeoSphere Austria (Data Hub, Lizenz CC BY 4.0, kommerzielle Nutzung erlaubt)
und schreibt air.json.
  Luftgüte: chem-v2-1h-3km (PM2.5, PM10, NO2, O3); Orte außerhalb (z. B. Norddeutschland) aus chem-v2-1h-9km (Europa)
  Wetter:   nwp-v2-1h-1km (nur bis ca. 51,5° N; weiter nördlich bleibt der Luftaustausch leer) (Wind 10 m, rel. Feuchte, Temperatur 2 m); nwp-v1-1h-2500m wurde im Nov. 2026 eingestellt
Der Luftqualitätsindex wird nach den 2024 überarbeiteten EEA-Bändern selbst berechnet.
Pollen: keine frei kommerziell nutzbare Quelle eingebunden (pollen = null).
Orte: aus der Datenbank (Tabelle places), wenn SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY gesetzt sind,
sonst aus der eingebauten Liste PLACES unten.
Aufruf: python3 scripts/fetch_air.py [ausgabe.json]"""
import json, os, subprocess, sys, datetime, statistics, time, math, urllib.request
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Vienna")
BASE = "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/"
PLACES = [
  ("dornbirn","Dornbirn","Vorarlberg",47.4125,9.7417,437), ("bregenz","Bregenz","Vorarlberg",47.5031,9.7471,398),
  ("feldkirch","Feldkirch","Vorarlberg",47.2371,9.5980,458), ("bludenz","Bludenz","Vorarlberg",47.1547,9.8222,588),
  ("lustenau","Lustenau","Vorarlberg",47.4269,9.6586,404), ("hohenems","Hohenems","Vorarlberg",47.3633,9.6889,432),
  ("goetzis","Götzis","Vorarlberg",47.3333,9.6333,448), ("rankweil","Rankweil","Vorarlberg",47.2711,9.6431,468),
  ("hard","Hard","Vorarlberg",47.4890,9.6900,400), ("wolfurt","Wolfurt","Vorarlberg",47.4667,9.7500,435),
  ("egg","Egg (Bregenzerwald)","Vorarlberg",47.4333,9.9000,565), ("schruns","Schruns","Vorarlberg",47.0800,9.9167,690),
  ("lech","Lech","Vorarlberg",47.2081,10.1419,1444),
  ("wien","Wien","Österreich",48.2082,16.3738,190), ("graz","Graz","Österreich",47.0707,15.4395,353),
  ("linz","Linz","Österreich",48.3069,14.2858,266), ("salzburg","Salzburg","Österreich",47.8095,13.0550,424),
  ("innsbruck","Innsbruck","Österreich",47.2692,11.4041,574), ("klagenfurt","Klagenfurt","Österreich",46.6247,14.3053,446),
  ("stpoelten","St. Pölten","Österreich",48.2047,15.6256,267), ("eisenstadt","Eisenstadt","Österreich",47.8457,16.5233,182),
  ("villach","Villach","Österreich",46.6111,13.8558,501), ("wels","Wels","Österreich",48.1575,14.0289,317),
  ("wrneustadt","Wiener Neustadt","Österreich",47.8111,16.2464,265), ("leoben","Leoben","Österreich",47.3817,15.0972,541),
  ("kufstein","Kufstein","Österreich",47.5833,12.1667,499), ("landeck","Landeck","Österreich",47.1397,10.5658,816),
  ("lienz","Lienz","Österreich",46.8297,12.7697,673),
  ("vaduz","Vaduz","Liechtenstein",47.1410,9.5215,455),
  ("stgallen","St. Gallen","Schweiz",47.4245,9.3767,669), ("altstaetten","Altstätten","Schweiz",47.3769,9.5475,455),
  ("buchs","Buchs SG","Schweiz",47.1667,9.4667,450), ("chur","Chur","Schweiz",46.8508,9.5320,593),
  ("zuerich","Zürich","Schweiz",47.3769,8.5417,408),
  ("lindau","Lindau","Deutschland",47.5460,9.6840,400), ("friedrichshafen","Friedrichshafen","Deutschland",47.6542,9.4790,400),
  ("kempten","Kempten","Deutschland",47.7267,10.3139,674), ("muenchen","München","Deutschland",48.1351,11.5820,519),
]
def places_from_db():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        return None
    req = urllib.request.Request(url.rstrip("/") + "/rest/v1/places?select=id,name,region,lat,lon,elev&active=eq.true&order=sort",
                                 headers={"apikey": key, **({"Authorization": "Bearer " + key} if key.startswith("eyJ") else {})})
    rows = json.load(urllib.request.urlopen(req, timeout=60))
    return [(r["id"], r["name"], r["region"], r["lat"], r["lon"], r["elev"]) for r in rows]

PLACES = places_from_db() or PLACES

# EEA-Bänder (Revision 2024, Stundenwerte) – Obergrenzen je Kategorie in µg/m³
BANDS = {"pm25":[5,15,50,90,140,800], "pm10":[15,45,120,195,270,1200], "no2":[10,25,60,100,150,1000], "o3":[60,100,120,160,180,800]}

def sub_index(k, c):
    """Konzentration -> Indexwert 0..120 (je Kategorie 20 Punkte, linear)."""
    if c is None: return None
    lo = 0
    for i, hi in enumerate(BANDS[k]):
        if c <= hi or i == len(BANDS[k]) - 1:
            return round(i * 20 + 20 * min(1, (c - lo) / (hi - lo)))
        lo = hi

class OutOfBounds(Exception):
    pass

def get(url):
    last = None
    for attempt in range(4):
        try:
            r = subprocess.run(["curl", "-sS", "-m", "90", "-w", "\n%{http_code}", url], capture_output=True, text=True, check=True).stdout
            body, code = r.rsplit("\n", 1)
            time.sleep(0.4)  # GeoSphere: max. 5 Anfragen/s
            if code == "200":
                return json.loads(body)
            if code in ("400", "422") and "outside" in body:
                raise OutOfBounds(body[:200])
            last = "HTTP %s %s" % (code, body[:200])
        except OutOfBounds:
            raise
        except Exception as e:
            last = e
        time.sleep(5)
    raise SystemExit("Abruf fehlgeschlagen: %s" % last)

def features(dataset, params, pts, with_start=True):
    """Liefert je Ort (feature, timestamps) oder None, wenn der Ort außerhalb des Modellgebiets liegt.
    Liegt ein Ort eines Pakets außerhalb, werden die Orte einzeln abgefragt."""
    def one(batch):
        ll = "&".join("lat_lon=%s,%s" % (p[3], p[4]) for p in batch)
        url = BASE + "%s?parameters=%s&%s&output_format=geojson" % (dataset, params, ll)
        try:
            j = get(url + ("&start=" + start if with_start else ""))
        except SystemExit:
            if not with_start: raise
            j = get(url)   # Lauf beginnt erst nach Mitternacht: ohne Startzeit
        return [(f, j["timestamps"]) for f in j["features"]]
    try:
        return one(pts)
    except OutOfBounds:
        out = []
        for p in pts:
            try: out += one([p])
            except OutOfBounds: out.append(None)
        return out

def local(ts):
    return datetime.datetime.fromisoformat(ts).astimezone(TZ)

def build(place, chem, nwp, ctimes, wtimes):
    pid, name, region, lat, lon, elev = place
    P = chem["properties"]["parameters"]; W = nwp["properties"]["parameters"] if nwp else {}
    W = {"u10m": W.get("10u") or W.get("u10m"), "v10m": W.get("10v") or W.get("v10m"),
         "rh2m": W.get("2r") or W.get("rh2m"), "t2m": W.get("2t") or W.get("t2m")}
    hours = {}
    for i, ts in enumerate(ctimes):
        t = local(ts); hours.setdefault(t.date().isoformat(), {})[t.hour] = {
            "pm25": P["pm25surf"]["data"][i], "pm10": P["pm10surf"]["data"][i], "no2": P["no2surf"]["data"][i], "o3": P["o3surf"]["data"][i]}
    met = {}
    for i, ts in enumerate(wtimes if nwp else []):
        t = local(ts); u, v = W["u10m"]["data"][i], W["v10m"]["data"][i]
        met.setdefault(t.date().isoformat(), {})[t.hour] = {"wind": None if u is None or v is None else math.hypot(u, v),
                                                              "rh": W["rh2m"]["data"][i], "t2m": W["t2m"]["data"][i]}
    days = []
    for d in sorted(hours)[:3]:
        hh = hours[d]
        def mean(k): xs = [h[k] for h in hh.values() if h[k] is not None]; return round(statistics.mean(xs), 1) if xs else 0
        aqi_h = []
        for hr in range(24):
            h = hh.get(hr)
            aqi_h.append(None if not h else max(x for x in (sub_index(k, h[k]) for k in BANDS) if x is not None))
        valid = [x for x in aqi_h if x is not None]
        m = met.get(d, {}); morning = [m[h] for h in range(6, 11) if h in m and m[h]["wind"] is not None]
        inv = None
        if morning:
            wind = statistics.mean(x["wind"] for x in morning); rh = statistics.mean(x["rh"] for x in morning)
            t7 = (m.get(7) or morning[0])["t2m"]
            level = "stark" if (wind < 1.5 and rh >= 88) else ("leicht" if wind < 2.5 else "keine")
            inv = {"level": level, "wind": round(wind, 1), "rh": round(rh), "t2m": t7}
        days.append({"date": d, "aqi_max": max(valid) if valid else 0,
                     "pm25": mean("pm25"), "pm10": mean("pm10"), "no2": mean("no2"),
                     "o3_max": round(max([h["o3"] for h in hh.values() if h["o3"] is not None] or [0]), 1),
                     "pollen": None, "inversion": inv, "aqi_hourly": aqi_h})
    return {"id": pid, "name": name, "region": region, "lat": lat, "lon": lon, "elev": elev, "days": days}

today = datetime.datetime.now(TZ).date()
start = datetime.datetime.combine(today, datetime.time(0), TZ).astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M")
out_places = []
B = 10
fine, coarse, no_wx = 0, 0, 0
for s in range(0, len(PLACES), B):
    batch = PLACES[s:s+B]
    chem = features("chem-v2-1h-3km", "pm25surf,pm10surf,no2surf,o3surf", batch)
    missing = [p for p, c in zip(batch, chem) if c is None]
    if missing:   # außerhalb des 3-km-Gebiets: europaweites 9-km-Modell
        wide = iter(features("chem-v2-1h-9km", "pm25surf,pm10surf,no2surf,o3surf", missing))
        chem = [c if c is not None else next(wide) for c in chem]
    nwp = features("nwp-v2-1h-1km", "2t,2r,10u,10v", batch)
    for p, c, w in zip(batch, chem, nwp):
        if c is None:
            print("übersprungen (keine Luftdaten):", p[1]); continue
        fine += 1 if p not in missing else 0; coarse += 1 if p in missing else 0; no_wx += 1 if w is None else 0
        out_places.append(build(p, c[0], w and w[0], c[1], w[1] if w else []))
print("Luftgüte 3 km: %d, 9 km: %d, ohne Wetterdaten: %d" % (fine, coarse, no_wx))

data = {"updated": datetime.datetime.now(TZ).isoformat(timespec="minutes"),
        "source": "GeoSphere Austria (CC BY 4.0)", "default": "dornbirn", "places": out_places}
path = sys.argv[1] if len(sys.argv) > 1 else "air.json"
json.dump(data, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
print("ok", path, len(out_places), "Orte;", [(p["name"], p["days"][0]["aqi_max"], p["days"][0]["inversion"]) for p in out_places[:3]])
