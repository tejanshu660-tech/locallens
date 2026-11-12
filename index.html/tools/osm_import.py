#!/usr/bin/env python3
"""LocalLens OpenStreetMap importer.

Fetches places for one city from the public Overpass API and writes LocalLens records
into data/listings.json. Run it yourself, with internet access, from the project root:

  python tools/osm_import.py --city-id jaipur --city-name Jaipur \
      --types cafe,restaurant,mall,attraction --limit 150 --contact you@example.com

Rules this script follows:
  * Only values that exist in OpenStreetMap tags are copied. Nothing is invented:
    no ratings, no descriptions, no prices, no verification.
  * Every record is marked verification="sourced" (imported, NOT verified by LocalLens).
  * Records you verified by hand (verification="verified") are never overwritten.
  * Data licence: ODbL 1.0, attribution "© OpenStreetMap contributors".
  * Overpass is a shared public service: one request per run, a descriptive User-Agent with
    your contact, a timeout and one polite retry. Do not loop over hundreds of cities quickly.
"""
import argparse, datetime, json, os, sys, time, urllib.error, urllib.parse, urllib.request

ENDPOINT = "https://overpass-api.de/api/interpreter"
# type name -> (OSM key, OSM value, LocalLens category, subcategory)
TYPES = {
    "cafe":        ("amenity", "cafe",         "cafe",       "Cafe"),
    "restaurant":  ("amenity", "restaurant",   "restaurant", "Restaurant"),
    "fastfood":    ("amenity", "fast_food",    "restaurant", "Fast food"),
    "foodcourt":   ("amenity", "food_court",   "restaurant", "Food court"),
    "mall":        ("shop",    "mall",         "shopping",   "Shopping mall"),
    "market":      ("amenity", "marketplace",  "shopping",   "Market"),
    "hotel":       ("tourism", "hotel",        "hotel",      "Hotel"),
    "guesthouse":  ("tourism", "guest_house",  "hotel",      "Guest house"),
    "attraction":  ("tourism", "attraction",   "tourism",    "Attraction"),
    "museum":      ("tourism", "museum",       "tourism",    "Museum"),
    "viewpoint":   ("tourism", "viewpoint",    "tourism",    "Viewpoint"),
    "monument":    ("historic", "monument",    "tourism",    "Monument"),
    "fort":        ("historic", "fort",        "tourism",    "Fort"),
    "park":        ("leisure", "park",         "tourism",    "Park"),
    "cinema":      ("amenity", "cinema",       "activity",   "Cinema"),
}

def build_query(city_name, types, limit, area_id=None):
    area = (f"area({int(area_id)})->.a;" if area_id
            else f'area["name"="{city_name}"]["boundary"="administrative"]->.a;')
    parts = "".join(f'nwr["{TYPES[t][0]}"="{TYPES[t][1]}"](area.a);' for t in types)
    return f"[out:json][timeout:60];{area}({parts});out center tags {int(limit)};"

def _first(tags, *keys):
    for k in keys:
        v = tags.get(k)
        if v:
            return v.split(";")[0].strip()
    return None

def transform(el, city_id, type_name, today=None):
    """OSM element -> LocalLens record, or None when it has no usable name."""
    tags = el.get("tags") or {}
    name = _first(tags, "name", "name:en")
    if not name:
        return None
    key, val, category, sub = TYPES[type_name]
    lat = el.get("lat", (el.get("center") or {}).get("lat"))
    lon = el.get("lon", (el.get("center") or {}).get("lon"))
    addr_bits = [tags.get(k) for k in ("addr:housenumber", "addr:street", "addr:suburb", "addr:city", "addr:postcode")]
    addr_bits = [b for b in addr_bits if b]
    links = {k: v for k, v in {
        "website": _first(tags, "contact:website", "website"),
        "instagram": _first(tags, "contact:instagram"),
        "facebook": _first(tags, "contact:facebook"),
    }.items() if v}
    attrs = {k: tags[k] for k in ("cuisine", "opening_hours", "wheelchair", "diet:vegetarian", "diet:vegan", "outdoor_seating", "internet_access") if k in tags}
    osm_type, osm_id = el.get("type", "node"), el.get("id")
    return {
        "id": f"osm-{osm_type}-{osm_id}",
        "name": name,
        "category": category,
        "subcategory": sub,
        "city": city_id,
        "address": {"full": ", ".join(addr_bits)} if addr_bits else None,
        "description": tags.get("description") or None,
        "image": None,
        "contact": {"phone": _first(tags, "contact:phone", "phone"), "email": _first(tags, "contact:email", "email")},
        "links": links,
        "lat": lat, "lon": lon,
        "priceLevel": None,
        "tags": [],
        "attributes": attrs,
        "source": {"name": "OpenStreetMap", "url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
                   "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors",
                   "fetchedAt": today or datetime.date.today().isoformat()},
        "lastVerified": None,
        "verification": "sourced",
    }

def classify(el, types):
    tags = el.get("tags") or {}
    for t in types:
        if tags.get(TYPES[t][0]) == TYPES[t][1]:
            return t
    return None

def merge(existing, new):
    """Insert/refresh imported records; never overwrite records verified by hand."""
    by_id = {r["id"]: r for r in existing}
    for r in new:
        if by_id.get(r["id"], {}).get("verification") == "verified":
            continue
        by_id[r["id"]] = r
    return list(by_id.values())

def fetch(query, contact, endpoint=ENDPOINT):
    req = urllib.request.Request(endpoint, data=urllib.parse.urlencode({"data": query}).encode(),
                                 headers={"User-Agent": f"LocalLensImporter/1.0 ({contact})"})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 504) and attempt == 1:
                wait = int(e.headers.get("Retry-After", "30")); print(f"Overpass busy ({e.code}); waiting {wait}s once...")
                time.sleep(wait); continue
            sys.exit(f"Overpass error {e.code}. Try again later; do not hammer the service.")
        except urllib.error.URLError as e:
            sys.exit(f"Network error: {e.reason}")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--city-id", required=True, help="LocalLens city id from data.js, e.g. jaipur")
    ap.add_argument("--city-name", required=True, help="OSM place name, e.g. Jaipur")
    ap.add_argument("--area-id", help="optional OSM area id (relation id + 3600000000) when the name is ambiguous")
    ap.add_argument("--types", default="cafe,restaurant,attraction", help="comma list: " + ",".join(TYPES))
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--contact", required=True, help="your email or URL; sent in the User-Agent as Overpass asks")
    ap.add_argument("--out", default="data/listings.json")
    a = ap.parse_args()
    types = [t.strip() for t in a.types.split(",") if t.strip()]
    bad = [t for t in types if t not in TYPES]
    if bad: sys.exit(f"Unknown types: {bad}")
    data = fetch(build_query(a.city_name, types, a.limit, a.area_id), a.contact)
    new = [r for r in (transform(e, a.city_id, classify(e, types)) for e in data.get("elements", []) if classify(e, types)) if r]
    doc = json.load(open(a.out, encoding="utf-8")) if os.path.exists(a.out) else {"schemaVersion": 1, "records": []}
    doc["records"] = merge(doc.get("records", []), new)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"Imported {len(new)} named records for {a.city_name}. Review them, then verify by hand before marking any 'verified'.")

if __name__ == "__main__":
    main()
