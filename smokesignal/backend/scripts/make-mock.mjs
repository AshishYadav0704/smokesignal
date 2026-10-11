// Generates SYNTHETIC data so the frontend can be built before AWS is deployed.
// Output is marked "mock": true and the UI shows a MOCK DATA banner. Never use it in the demo video.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from '../src/lib/snapshot.mjs';
import { fallbackBulletin } from '../src/lib/bulletin-text.mjs';
import { makeGrid } from '../src/lib/openmeteo.mjs';
import { WIND_BBOX, WIND_STEP_DEG, PLACES, CITIES } from '../src/lib/regions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../frontend/public/mock-latest.json');

// deterministic random numbers
let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

const t0 = Date.parse('2026-10-10T15:00:00Z') / 1000;

// Synthetic fires around typical paddy-belt districts.
const weights = { Sangrur: 9, Patiala: 6, Bathinda: 5, Mansa: 5, Barnala: 4, Moga: 4, Ferozepur: 5, 'Tarn Taran': 5, Amritsar: 4, Ludhiana: 3, Kaithal: 4, Fatehabad: 3, Jind: 2, Kurukshetra: 2, Karnal: 2, Sirsa: 2, Kasur: 3, Okara: 2 };
const fires = [];
for (const [name, w] of Object.entries(weights)) {
  const p = PLACES.find((x) => x.name === name);
  for (let k = 0; k < w * 40; k++) {
    fires.push({ lat: p.lat + gauss() * 0.15, lon: p.lon + gauss() * 0.18, frp: Math.round(Math.exp(1.6 + gauss() * 0.8) * 10) / 10 });
  }
}

// Synthetic north-westerly flow that slowly backs to westerly and is faster in the north.
const { lats, lons } = makeGrid(WIND_BBOX, WIND_STEP_DEG);
const times = Array.from({ length: 49 }, (_, k) => t0 + k * 3600);
const speed = [];
const dir = [];
for (let t = 0; t < times.length; t++) {
  for (let i = 0; i < lats.length; i++) {
    for (let j = 0; j < lons.length; j++) {
      const lat = lats[i];
      const lon = lons[j];
      speed.push(3.5 + 0.9 * (lat - 25.5) + 1.2 * Math.sin((t / 48) * Math.PI));
      dir.push(322 - 0.35 * t + 2.5 * (lon - 77) + 4 * Math.sin(lat));
    }
  }
}

const snapshot = buildSnapshot({
  runId: 'mock',
  fires,
  wind: { level: '925hPa (synthetic)', lats, lons, times, speed, dir },
  airQuality: Object.fromEntries(CITIES.map((c, k) => [c.slug, {
    times: times.slice(),
    pm25: times.map((_, h) => Math.round(45 + 25 * k / CITIES.length + 30 * Math.max(0, Math.sin(((h - 8) / 24) * Math.PI)))),
  }])),
  t0,
  generatedAt: new Date(t0 * 1000).toISOString(),
  meta: { mock: true, fireSources: ['SYNTHETIC'] },
});
snapshot.bulletin = { ...fallbackBulletin(snapshot), source: 'template' };

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot));
console.log(`mock snapshot -> ${out}`);
console.log(snapshot.cities.map((c) => `${c.name.padEnd(11)} ${c.level.padEnd(9)} eta ${c.etaHours ?? '-'}h`).join('\n'));
