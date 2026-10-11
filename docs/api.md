# SmokeSignal API

Base URL: https://mao67tmw8j.execute-api.ap-south-1.amazonaws.com

## GET /latest
The latest forecast snapshot. Cached for 60 s.

```jsonc
{
  "runId": "manual-1760104800000",
  "generatedAt": "2026-10-10T15:00:00.000Z",
  "t0": 1760108400,                 // unix seconds; hour 0 of the forecast
  "hours": 48,
  "windLevel": "925hPa",
  "params": { "arrivalKm": 35, "decayHours": 36, "releases": [0, 3, 6], "levels": { "low": 50, "moderate": 300, "high": 1500 } },
  "fireStats": { "count": 2800, "totalFrpMW": 19115.3, "clusters": 591, "simulatedClusters": 150 },
  "fires": [[30.245, 75.844, 12.5]],          // [lat, lon, FRP MW], largest first, max 4000
  "clusters": [{
    "id": "c12", "lat": 30.16, "lon": 75.37, "count": 21, "frp": 240.1,
    "label": "near Mansa", "region": "Punjab",
    "impact": 1234.5,                         // people-weighted smoke delivered
    "citiesReached24h": ["Delhi", "Noida"], "peopleDownwind24h": 17440000, "priority": 1
  }],
  "trajectories": [{ "c": "c12", "r": 0, "w": 80, "pts": [[30.16, 75.37], [30.08, 75.49]], "exited": false }],
                                              // pts are hourly positions starting at hour r
  "cities": [{
    "slug": "delhi", "name": "Delhi", "hi": "दिल्ली", "lat": 28.6139, "lon": 77.209, "pop": 16800000,
    "level": "high",                          // none | low | moderate | high, next 48 h
    "level24": "high",                        // same, next 24 h (used for alerts)
    "etaHours": 7.8,                          // when 10% of the expected smoke load has arrived
    "firstContactHours": 6.2,
    "arrivingFrp": 2100.4, "arrivingFrp24": 1900.2,
    "peakWindow": { "start": 6, "end": 12, "frp": 900.1 },
    "sources": [{ "label": "near Sangrur", "region": "Punjab", "share": 20, "clusters": ["c1", "c4"] }],
    "airQuality": { "times": [1760108400], "pm25": [72.1] }   // CAMS forecast
  }],
  "bulletin": { "en": "…", "hi": "…", "source": "bedrock", "model": "amazon.nova-lite-v1:0" }
}
```

`404` if the pipeline has never run.

## GET /cities
The 17 tracked cities: `[{ slug, name, hi, lat, lon, pop }]`.

## GET /history?city=delhi
The last 24 runs for one city, newest first: `[{ at, level, level24, etaHours, arrivingFrp }]`.

## POST /subscribe
```json
{ "email": "you@example.com", "city": "delhi" }
```
Creates an SNS email subscription with filter policy `{"city": ["delhi"]}`. AWS sends a confirmation email first.
Returns `{ "status": "pending_confirmation", "message": "…" }`.

## POST /run
Starts the pipeline now. Header `x-admin-key: <AdminKey>` is required. Returns `202 { executionArn }`.
Last checked against the live API: 11 October
