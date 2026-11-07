#!/usr/bin/env python3
"""Atemwetter: Pollenprognose vom Copernicus-Atmosphärendienst (CAMS European air quality forecasts,
Ensemble, Lizenz: Copernicus-Lizenz, kommerzielle Nutzung mit Quellenangabe erlaubt).
Braucht ~/.cdsapirc mit url und key des ADS-Kontos sowie die Pakete cdsapi, xarray, netCDF4.
Aufruf: python3 scripts/fetch_pollen.py air.json
 - ergänzt in air.json je Ort und Tag die Felder pollen (Tageshöchstwerte) und pollen_hourly
 - schreibt optional den komprimierten Inhalt (gzip+base64) für das öffentliche Pollen-Dokument der Android-App"""
import base64, datetime, glob, gzip, json, os, sys, tempfile, zipfile
from zoneinfo import ZoneInfo
import cdsapi, numpy as np, xarray as xr

TZ = ZoneInfo("Europe/Vienna")
VARS = {"alder": "apg_conc", "birch": "bpg_conc", "grass": "gpg_conc", "mugwort": "mpg_conc", "ragweed": "rwpg_conc"}
air_path = sys.argv[1]
doc_path = sys.argv[2] if len(sys.argv) > 2 else None
air = json.load(open(air_path, encoding="utf-8"))
places = air["places"]
lats = [p["lat"] for p in places]; lons = [p["lon"] for p in places]
area = [round(max(lats) + 0.5, 1), round(min(lons) - 0.5, 1), round(min(lats) - 0.5, 1), round(max(lons) + 0.5, 1)]

run = datetime.datetime.now(datetime.timezone.utc).date()
tmp = tempfile.mkdtemp()
req = {"variable": [k + "_pollen" for k in VARS], "model": ["ensemble"], "level": ["0"], "type": ["forecast"], "time": ["00:00"],
       "leadtime_hour": [str(h) for h in range(0, 96)], "data_format": "netcdf_zip", "area": area}
client = cdsapi.Client(quiet=True, progress=False)
for back in range(0, 2):  # falls der heutige Lauf noch nicht bereitsteht, den von gestern nehmen
    d = (run - datetime.timedelta(days=back)).isoformat()
    try:
        client.retrieve("cams-europe-air-quality-forecasts", dict(req, date=[d + "/" + d]), os.path.join(tmp, "p.zip"))
        base = datetime.datetime.fromisoformat(d + "T00:00:00+00:00"); break
    except Exception as e:
        last = e
else:
    raise SystemExit("Pollenabruf fehlgeschlagen: %s" % last)
zipfile.ZipFile(os.path.join(tmp, "p.zip")).extractall(tmp)
ds = xr.open_dataset(glob.glob(os.path.join(tmp, "*.nc"))[0])

today = datetime.datetime.now(TZ).date().isoformat()
doc = {"updated": datetime.datetime.now(TZ).isoformat(timespec="minutes"), "source": "Copernicus CAMS", "places": {}}
for p in places:
    pt = ds.sel(latitude=p["lat"], longitude=p["lon"], method="nearest")
    series = {k: pt[v].values.reshape(-1) for k, v in VARS.items()}
    hours = {}
    for i, h in enumerate(ds["time"].values):
        t = (base + datetime.timedelta(hours=float(h))).astimezone(TZ)
        hours.setdefault(t.date().isoformat(), {})[t.hour] = {k: float(series[k][i]) for k in VARS}
    per = {}
    for day in p["days"]:
        hh = hours.get(day["date"])
        if not hh or len(hh) < 12:
            continue
        mx = {k: round(max(x[k] for x in hh.values()), 1) for k in VARS}
        hourly = {k: [round(hh[h][k], 1) if h in hh else 0 for h in range(24)] for k in VARS if mx[k] >= 1}
        day["pollen"] = mx; day["pollen_hourly"] = hourly
        per[day["date"]] = {"pollen": mx, "pollen_hourly": hourly}
    doc["places"][p["id"]] = per
air["pollen_source"] = "Copernicus CAMS (Ensemble)"
json.dump(air, open(air_path, "w"), ensure_ascii=False, separators=(",", ":"))
if doc_path:
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    open(doc_path, "w").write(base64.b64encode(gzip.compress(raw, 9)).decode("ascii"))
print("ok Pollenlauf", base.date(), "Orte", len(places), "Beispiel", places[0]["name"], places[0]["days"][0].get("pollen"))
