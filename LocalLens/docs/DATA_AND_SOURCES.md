# LocalLens: data, sources and verification

**Current state:** `data/listings.json` is empty. LocalLens has **no verified and no imported business data yet.**
What you see today is (a) 14 *name-only* landmark records and (b) generated *demo placeholders*. Both are labelled in the UI.

## 1. Verification statuses
| Status | Meaning | Badge |
|---|---|---|
| `verified` | A person at LocalLens checked the record against a source on `lastVerified`. Requires `lastVerified`. | ✓ Verified |
| `sourced` | Imported from a provider (e.g. OpenStreetMap). Copied as-is, not checked by us. | Imported, unverified |
| `unverified` | Only the name is known (seed list). Details not checked. | Details unverified |
| `demo` | Generated placeholder, not a real business. | Demo listing |

## 2. Record format (`data/listings.json` → `records[]`)
```json
{
  "id": "osm-node-123",            // unique, required
  "name": "…",                     // required
  "category": "cafe",              // required: cafe|restaurant|shopping|tourism|gem|adventure|activity|hotel
  "subcategory": "Cafe",
  "city": "jaipur",                // required: a city id from data.js (CITIES)
  "address": {"full": "…"},        // null when unknown
  "description": "…",              // null when unknown
  "image": {"url":"https://…","credit":"Photographer","creditUrl":"https://…","license":"…"},
  "contact": {"phone":"+91…","email":"…"},
  "links": {"website":"https://…","instagram":"https://…","facebook":"https://…","x":"…","youtube":"…"},
  "lat": 26.9, "lon": 75.8,        // only real coordinates; both or neither
  "priceLevel": 2,                 // 1-3 or null
  "tags": ["rooftop"],
  "attributes": {"cuisine":"…"},
  "source": {"name":"OpenStreetMap","url":"…","license":"ODbL 1.0","attribution":"© OpenStreetMap contributors","fetchedAt":"2026-01-01"},
  "lastVerified": "2026-01-01",    // null unless a person verified it
  "verification": "sourced"
}
```
The app validates every record on load. Records missing `id`/`name`/valid `category`/known `city`/valid `verification`, duplicate ids, or `verified` without `lastVerified` are **skipped** and counted in the on-page data status. Out-of-range coordinates and non-http(s) links are dropped, never repaired.

## 3. Workflows
**Import from OpenStreetMap (needs internet; you run it):**
`python tools/osm_import.py --city-id jaipur --city-name Jaipur --types cafe,restaurant,attraction --contact you@example.com`
Review the output, then spot-check places against an independent source before changing any record to `verified`.

**Business submissions:** the Contact page form collects name, category, location, address, phone, website. Today it only stores the entry in the visitor's browser and (once deployed on Netlify) in Netlify Forms. A person must verify a submission before it becomes a `verified` record.

## 4. Source evaluation (confirm current terms before relying on any of these)
| Source | Use | Notes |
|---|---|---|
| **OpenStreetMap via Overpass** | POI names, coordinates, some addresses/phones/websites | Free, no key. ODbL: attribution "© OpenStreetMap contributors" required; adapted databases must stay ODbL. Public Overpass servers are shared: low volume, descriptive User-Agent. India coverage is uneven; contacts and hours are often missing; **no ratings or reviews**. Best first source. |
| **Nominatim (OSM geocoder)** | Look up one address → coordinates | Public instance allows ~1 request/second, no bulk, requires User-Agent. For bulk, self-host or use a commercial geocoder. |
| **Wikidata / Wikimedia Commons** | Landmark facts and freely licensed photos | Reuse needs the stated licence and attribution per image. |
| **data.gov.in / state tourism open datasets** | Official tourism lists | Check each dataset's licence (often GODL-India) before use. |
| **Foursquare Places, Google Places** | Rich business data | Require an API key and have strict terms on caching, storage and attribution. Keys must stay on a server (see below). Not integrated. |
| **Owner submissions + manual verification** | Highest-quality verified data | Slow, but the only route to genuinely `verified` records. |
| **Scraping Zomato, Swiggy, Google Maps, Justdial, etc.** | **Not allowed** | Their terms forbid it. LocalLens does not do this. |

## 5. API keys
No key is needed for anything built so far. **Never put a private key in `script.js` or any file the browser loads.** If you adopt a keyed provider, call it from a server-side function (for example a Netlify Function reading an environment variable) and have the website call your function.

## 6. Maps
Map links use a record's real coordinates (OpenStreetMap view, Google Maps view, directions). With no coordinates, the site offers only a name-and-city *search* link, labelled approximate. No coordinates are ever guessed.
