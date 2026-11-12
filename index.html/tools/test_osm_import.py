"""Tests for tools/osm_import.py using a SYNTHETIC fixture (not real places)."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
import osm_import as o
FIX = [
 {"type":"node","id":1,"lat":10.5,"lon":20.5,"tags":{"amenity":"cafe","name":"Fixture Cafe","addr:street":"Test Road","phone":"+00 111;+00 222","website":"https://example.test"}},
 {"type":"way","id":2,"center":{"lat":11.0,"lon":21.0},"tags":{"tourism":"attraction","name":"Fixture Place"}},
 {"type":"node","id":3,"lat":1,"lon":2,"tags":{"amenity":"cafe"}},                      # unnamed -> skipped
 {"type":"node","id":4,"lat":1,"lon":2,"tags":{"shop":"bakery","name":"Not requested"}}, # type not requested
]
types = ["cafe","attraction"]
recs = [r for r in (o.transform(e,"testcity",o.classify(e,types),"2026-01-01") for e in FIX if o.classify(e,types)) if r]
assert [r["id"] for r in recs] == ["osm-node-1","osm-way-2"], recs
a,b = recs
assert a["lat"]==10.5 and a["lon"]==20.5 and b["lat"]==11.0 and b["lon"]==21.0   # coordinates come only from OSM
assert a["contact"]["phone"]=="+00 111" and a["links"]["website"]=="https://example.test"
assert a["address"]=={"full":"Test Road"} and b["address"] is None               # no invented address
assert all(r["verification"]=="sourced" and r["lastVerified"] is None and r["priceLevel"] is None and r["description"] is None for r in recs)
assert a["source"]["license"]=="ODbL 1.0" and "OpenStreetMap" in a["source"]["attribution"]
# merge never overwrites hand-verified records
existing=[{"id":"osm-node-1","verification":"verified","name":"Hand verified"}]
m=o.merge(existing,recs); assert [x for x in m if x["id"]=="osm-node-1"][0]["name"]=="Hand verified" and len(m)==2
q=o.build_query("Jaipur",["cafe","mall"],50); assert 'nwr["amenity"="cafe"]' in q and 'nwr["shop"="mall"]' in q and "out center tags 50" in q
print("osm_import tests passed")
