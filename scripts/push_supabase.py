#!/usr/bin/env python3
"""Schreibt die Tagesdaten aus air.json in die Tabelle air_days (Upsert) und räumt alte Tage auf.
Braucht SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY (nur als GitHub-Secret, nie im Code).
Aufruf: python3 scripts/push_supabase.py air.json"""
import json, os, sys, urllib.request

url = os.environ["SUPABASE_URL"].rstrip("/"); key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}
air = json.load(open(sys.argv[1], encoding="utf-8"))

rows = []
for p in air["places"]:
    for d in p["days"]:
        rows.append({"place_id": p["id"], "date": d["date"], "aqi_max": d.get("aqi_max"), "pm25": d.get("pm25"), "pm10": d.get("pm10"),
                     "no2": d.get("no2"), "o3_max": d.get("o3_max"), "inversion": d.get("inversion"), "aqi_hourly": d.get("aqi_hourly") or [],
                     "pollen": d.get("pollen"), "pollen_hourly": d.get("pollen_hourly") or {}, "updated_at": air["updated"]})

def call(path, body, prefer=None):
    h = dict(H)
    if prefer: h["Prefer"] = prefer
    req = urllib.request.Request(url + path, data=json.dumps(body).encode("utf-8"), headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status

for i in range(0, len(rows), 200):
    call("/rest/v1/air_days?on_conflict=place_id,date", rows[i:i+200], "resolution=merge-duplicates,return=minimal")
call("/rest/v1/rpc/cleanup_air_days", {"keep_days": 7})
print("ok", len(rows), "Tageszeilen geschrieben")
