import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  windToUV, haversineKm, buildWindField, sampleWind, advect, clusterFires, labelFor, simulate,
} from '../src/lib/smoke.mjs';
import { parseFirmsCsv, filterFires, dedupeFires } from '../src/lib/firms.mjs';
import { makeGrid } from '../src/lib/openmeteo.mjs';
import { buildSnapshot, summarize } from '../src/lib/snapshot.mjs';
import { fallbackBulletin, parseModelJson, bulletinFacts } from '../src/lib/bulletin-text.mjs';
import { CITIES } from '../src/lib/regions.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

/** Uniform wind field over a box (speed m/s, direction wind comes FROM). */
function uniformWind({ speed, dir, bbox = { west: 70, south: 24, east: 84, north: 34 }, step = 0.5, t0 = 0, hours = 49 }) {
  const { lats, lons } = makeGrid(bbox, step);
  const times = Array.from({ length: hours }, (_, k) => t0 + k * 3600);
  const n = times.length * lats.length * lons.length;
  return { level: 'test', lats, lons, times, speed: new Array(n).fill(speed), dir: new Array(n).fill(dir) };
}

test('wind direction converts to u/v (meteorological convention)', () => {
  const w = windToUV(10, 270); // from the west -> blows east
  close(w.u, 10, 1e-9);
  close(w.v, 0, 1e-9);
  const n = windToUV(10, 0); // from the north -> blows south
  close(n.u, 0, 1e-9);
  close(n.v, -10, 1e-9);
  const nw = windToUV(10, 315); // from the north-west -> blows south-east
  assert.ok(nw.u > 0 && nw.v < 0);
});

test('haversine distance Delhi to Chandigarh is about 235 km', () => {
  close(haversineKm(28.6139, 77.209, 30.7333, 76.7794), 238, 10);
});

test('bilinear sampling interpolates between grid points', () => {
  const g = { lats: [0, 1], lons: [0, 1], times: [0], speed: [0, 10, 0, 10], dir: [270, 270, 270, 270] };
  const f = buildWindField(g);
  close(sampleWind(f, 0.5, 0.5, 0).u, 5, 1e-6);
  assert.equal(sampleWind(f, 2, 0.5, 0), null, 'outside grid returns null');
});

test('a parcel in a 10 m/s westerly moves ~36 km east in one hour', () => {
  const f = buildWindField(uniformWind({ speed: 10, dir: 270 }));
  let p = { lat: 30, lon: 75 };
  for (let s = 0; s < 6; s++) p = advect(f, p.lat, p.lon, s * 600, 600);
  close(haversineKm(30, 75, p.lat, p.lon), 36, 0.2);
  close(p.lat, 30, 1e-6);
  assert.ok(p.lon > 75);
});

test('fires in the same ~10 km cell are clustered and FRP is summed', () => {
  const c = clusterFires([
    { lat: 30.01, lon: 75.01, frp: 10 },
    { lat: 30.05, lon: 75.08, frp: 30 },
    { lat: 31.5, lon: 74.9, frp: 5 },
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].frp, 40);
  assert.equal(c[0].count, 2);
  assert.equal(c[0].id, 'c1');
});

test('clusters are labelled with the nearest district HQ, or coordinates if none is close', () => {
  const places = [{ name: 'Sangrur', region: 'Punjab', lat: 30.245, lon: 75.844 }];
  assert.equal(labelFor(30.3, 75.9, places).label, 'near Sangrur');
  assert.match(labelFor(25, 70, places).label, /°N/);
  const both = [...places, { name: 'Kasur', region: 'Pakistan', lat: 31.12, lon: 74.45 }];
  assert.equal(labelFor(31.1, 74.5, both).country, 'PK');
  assert.equal(labelFor(30.3, 75.9, both).country, 'IN');
});

test('smoke from a fire 100 km upwind reaches the city in ~2.8 h and is attributed to that fire', () => {
  const f = buildWindField(uniformWind({ speed: 10, dir: 270 }));
  const city = { slug: 'x', name: 'X', lat: 30, lon: 75 + 100 / (111.32 * Math.cos(30 * Math.PI / 180)), pop: 1_000_000 };
  const r = simulate({
    fires: [{ lat: 30, lon: 75, frp: 600 }],
    field: f,
    cities: [city],
    t0: 0,
    options: { releases: [0], arrivalKm: 5 },
  });
  const res = r.cities[0];
  close(res.etaHours, 2.8, 0.2, 'eta');
  assert.deepEqual(res.sources[0].clusters, ['c1']);
  assert.equal(res.sources[0].share, 100);
  assert.ok(res.arrivingFrp > 550 && res.arrivingFrp < 600, 'weight decays a little with age');
  assert.equal(r.clusters[0].priority, 1);
  assert.deepEqual(r.clusters[0].citiesReached24h, ['X']);
});

test('a city upwind of the fire gets no smoke', () => {
  const f = buildWindField(uniformWind({ speed: 8, dir: 270 }));
  const r = simulate({
    fires: [{ lat: 30, lon: 76, frp: 2000 }],
    field: f,
    cities: [{ slug: 'w', name: 'West', lat: 30, lon: 75, pop: 1 }],
    t0: 0,
  });
  assert.equal(r.cities[0].level, 'none');
  assert.equal(r.cities[0].etaHours, null);
});

test('parcels that leave the wind grid stop and are marked exited', () => {
  const f = buildWindField(uniformWind({ speed: 20, dir: 270, bbox: { west: 74, south: 29, east: 76, north: 31 } }));
  const r = simulate({ fires: [{ lat: 30, lon: 75.5, frp: 100 }], field: f, cities: [], t0: 0, options: { releases: [0] } });
  assert.equal(r.trajectories[0].exited, true);
  assert.ok(r.trajectories[0].pts.length < 49);
});

test('FIRMS CSV is parsed, low-confidence and stale fires are dropped, duplicates merged', () => {
  const csv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
    '30.24,75.84,330.1,0.4,0.4,2026-10-10,0812,N,VIIRS,n,2.0NRT,295.1,12.5,D',
    '30.24,75.84,331.0,0.4,0.4,2026-10-10,0815,N20,VIIRS,h,2.0NRT,296.0,15.0,D',
    '30.50,75.50,320.0,0.4,0.4,2026-10-10,0812,N,VIIRS,l,2.0NRT,290.0,3.0,D',
    '29.90,75.10,320.0,0.4,0.4,2026-10-08,0812,N,VIIRS,n,2.0NRT,290.0,9.0,D',
  ].join('\n');
  const fires = parseFirmsCsv(csv);
  assert.equal(fires.length, 4);
  assert.equal(fires[0].at, '2026-10-10T08:12:00Z');
  const kept = dedupeFires(filterFires(fires, { now: Date.parse('2026-10-10T14:00:00Z'), maxAgeHours: 24 }));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].frp, 15);
  assert.throws(() => parseFirmsCsv('Invalid MAP_KEY.'), /did not return CSV/);
});

test('snapshot end-to-end: north-westerly winds carry Punjab smoke towards Delhi', () => {
  const wind = uniformWind({ speed: 6, dir: 324, bbox: { west: 72.5, south: 25.5, east: 81.5, north: 33 } });
  const fires = [];
  for (let k = 0; k < 40; k++) fires.push({ lat: 30.25 + (k % 5) * 0.02, lon: 75.84 + Math.floor(k / 5) * 0.02, frp: 20 });
  const s = buildSnapshot({ runId: 'test', fires, wind, t0: 0, generatedAt: '2026-10-10T15:00:00Z' });
  const delhi = s.cities.find((c) => c.slug === 'delhi');
  assert.ok(delhi.etaHours > 7 && delhi.etaHours < 11, `Delhi ETA ${delhi.etaHours}`);
  assert.notEqual(delhi.level, 'none');
  assert.match(delhi.sources[0].label, /Sangrur/);
  const jaipur = s.cities.find((c) => c.slug === 'jaipur');
  assert.equal(jaipur.level, 'none', 'Jaipur is not downwind of a NW flow from Sangrur');
  const sum = summarize(s);
  assert.equal(sum.cities.length, CITIES.length);
  const fb = fallbackBulletin(s);
  assert.match(fb.en, /Delhi/);
  assert.match(fb.hi, /दिल्ली/);
  assert.ok(bulletinFacts(s).cities.length >= 1);
});

test('model JSON is extracted even inside code fences', () => {
  assert.deepEqual(parseModelJson('```json\n{"en":"Hi","hi":"नमस्ते"}\n```'), { en: 'Hi', hi: 'नमस्ते' });
  assert.throws(() => parseModelJson('sorry'), /no JSON/);
});

import { shouldAlert, alertSubject, alertMessage } from '../src/lib/alerts.mjs';

test('alerts: moderate/heavy within 24 h, 12 h cooldown unless it gets worse', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const city = { name: 'Delhi', level24: 'moderate', etaHours: 9, sources: [], peakWindow: { start: 12, end: 18 } };
  assert.equal(shouldAlert(city, null, { now }), true);
  assert.equal(shouldAlert({ ...city, level24: 'low' }, null, { now }), false);
  assert.equal(shouldAlert({ ...city, etaHours: 30 }, null, { now }), false);
  const recent = { level: 'moderate', sentAt: '2026-10-10T06:00:00Z' };
  assert.equal(shouldAlert(city, recent, { now }), false, 'cooldown');
  assert.equal(shouldAlert({ ...city, level24: 'high' }, recent, { now }), true, 'escalation');
  assert.equal(shouldAlert(city, { level: 'moderate', sentAt: '2026-10-09T20:00:00Z' }, { now }), true, 'after cooldown');
  assert.match(alertSubject(city), /^SmokeSignal: moderate smoke heading to Delhi in ~9 h$/);
  assert.equal(alertSubject({ ...city, etaHours: 0.4, level24: 'high' }), 'SmokeSignal: heavy smoke reaching Delhi now');
  const msg = alertMessage({ ...city, airQuality: { pm25: [80, 140, null] } }, { bulletin: { en: 'EN', hi: 'हिंदी' } }, 'https://x.example');
  assert.match(msg, /MODERATE smoke, arriving in about 9 hours \(heaviest 12-18 h from now\)/);
  assert.match(msg, /max next 48 h: 140/);
  assert.match(msg, /Live map: https:\/\/x.example/);
});

import { getJson, fetchWindGrid } from '../src/lib/openmeteo.mjs';

test('Open-Meteo: 503 "overloaded" is retried, then succeeds; 400 is not retried', async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls < 3) return new Response(JSON.stringify({ error: true, reason: 'The service is overloaded' }), { status: 503 });
    return new Response(JSON.stringify({ hourly: { time: [0] } }));
  };
  const rows = await getJson('https://x', flaky, { sleepImpl: async () => {} });
  assert.equal(calls, 3);
  assert.equal(rows.length, 1);

  let bad = 0;
  const badReq = async () => { bad += 1; return new Response(JSON.stringify({ error: true, reason: 'bad variable' }), { status: 400 }); };
  await assert.rejects(getJson('https://x', badReq, { sleepImpl: async () => {} }), /400: bad variable/);
  assert.equal(bad, 1);

  let down = 0;
  const alwaysDown = async () => { down += 1; return new Response('{}', { status: 503 }); };
  await assert.rejects(getJson('https://x', alwaysDown, { retries: 2, sleepImpl: async () => {} }), /503/);
  assert.equal(down, 3);
});

test('wind grid is fetched in chunks of 50 points and assembled in grid order', async () => {
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    const u = new URL(url);
    const lats = u.searchParams.get('latitude').split(',').map(Number);
    const lons = u.searchParams.get('longitude').split(',').map(Number);
    const body = lats.map((la, k) => ({ hourly: { time: [0, 3600], wind_speed_925hPa: [la, la], wind_direction_925hPa: [lons[k], lons[k]] } }));
    return new Response(JSON.stringify(body.length === 1 ? body[0] : body));
  };
  const g = await fetchWindGrid({ bbox: { west: 70, south: 20, east: 79.5, north: 24.5 }, step: 0.5, fetchImpl: fake, retry: { sleepImpl: async () => {} } });
  const n = g.lats.length * g.lons.length; // 10 x 20 = 200 points -> 4 requests
  assert.equal(urls.length, Math.ceil(n / 50));
  const i = 3; const j = 7; // check one grid cell lands in the right slot
  assert.equal(g.speed[(1 * g.lats.length + i) * g.lons.length + j], g.lats[i]);
  assert.equal(g.dir[(0 * g.lats.length + i) * g.lons.length + j], g.lons[j]);
});

import { sliceTimes } from '../src/lib/openmeteo.mjs';

test('replay: archived winds come from the historical API and start at the replay hour', async () => {
  const start = Date.parse('2025-11-11T11:30:00Z') / 1000;
  const dayStart = Date.parse('2025-11-11T00:00:00Z') / 1000;
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    const u = new URL(url);
    const lats = u.searchParams.get('latitude').split(',');
    const time = Array.from({ length: 96 }, (_, k) => dayStart + k * 3600);
    const body = lats.map(() => ({ hourly: { time, wind_speed_925hPa: time.map((t) => t), wind_direction_925hPa: time.map(() => 300) } }));
    return new Response(JSON.stringify(body.length === 1 ? body[0] : body));
  };
  const g = await fetchWindGrid({ bbox: { west: 74, south: 29, east: 75, north: 30 }, step: 0.5, fetchImpl: fake, startSec: start, retry: { sleepImpl: async () => {} } });
  assert.match(urls[0], /^https:\/\/historical-forecast-api\.open-meteo\.com\/v1\/forecast\?/);
  assert.match(urls[0], /start_date=2025-11-11&end_date=2025-11-14/);
  assert.doesNotMatch(urls[0], /forecast_hours/);
  assert.equal(g.times.length, 49);
  assert.equal(g.times[0], dayStart + 12 * 3600, 'first step at or after 11:30 UTC');
  assert.equal(g.speed.length, 49 * g.lats.length * g.lons.length);
  assert.equal(g.speed[0], g.times[0], 'values shifted with the times');
  assert.throws(() => sliceTimes({ ...g, times: [1, 2] }, 99, 49), /No wind data/);
});

test('replay: fires after the replay time are ignored', () => {
  const now = Date.parse('2025-11-11T11:30:00Z');
  const f = (at) => ({ lat: 30, lon: 75, frp: 5, conf: 'n', at });
  const kept = filterFires([f('2025-11-11T08:10:00Z'), f('2025-11-10T20:30:00Z'), f('2025-11-11T20:30:00Z'), f('2025-11-10T05:00:00Z')], { now, maxAgeHours: 24 });
  assert.deepEqual(kept.map((x) => x.at), ['2025-11-11T08:10:00Z', '2025-11-10T20:30:00Z']);
});

test('fires across the border count as smoke sources but are not ranked for action', () => {
  const f = buildWindField(uniformWind({ speed: 8, dir: 270 }));
  const r = simulate({
    fires: [{ lat: 31.12, lon: 74.4, frp: 900 }, { lat: 31.12, lon: 75.1, frp: 100 }],
    field: f,
    cities: [{ slug: 'x', name: 'X', lat: 31.12, lon: 75.8, pop: 1_000_000 }],
    places: [{ name: 'Kasur', region: 'Pakistan', lat: 31.12, lon: 74.45 }, { name: 'Tarn Taran', region: 'Punjab', lat: 31.45, lon: 74.93 }],
    t0: 0,
  });
  const pk = r.clusters.find((c) => c.country === 'PK');
  const ind = r.clusters.find((c) => c.country === 'IN');
  assert.equal(pk.priority, null);
  assert.equal(ind.priority, 1);
  assert.ok(r.cities[0].sources.some((s) => s.region === 'Pakistan'), 'Pakistani smoke still attributed');
});

test('replay test alerts are clearly labelled', () => {
  const city = { name: 'Delhi', level24: 'high', etaHours: 6.3, sources: [], peakWindow: null };
  const snap = { replay: { date: '2025-11-11' }, bulletin: { en: 'EN', hi: 'HI' } };
  assert.equal(alertSubject(city, snap), '[TEST - replay of 2025-11-11] SmokeSignal: heavy smoke heading to Delhi in ~6 h');
  assert.match(alertMessage(city, snap, ''), /^TEST ALERT: replay of 2025-11-11/);
  assert.doesNotMatch(alertMessage(city, { bulletin: {} }, ''), /TEST/);
});
