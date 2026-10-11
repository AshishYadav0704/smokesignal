// Run the whole pipeline on your laptop with REAL data (no AWS needed).
//   FIRMS_MAP_KEY=xxxx node scripts/run-local.mjs
// Writes frontend/public/local-latest.json, which the frontend loads when VITE_API_URL is not set.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchFires } from '../src/lib/firms.mjs';
import { fetchWindGrid, fetchCityAirQuality } from '../src/lib/openmeteo.mjs';
import { buildSnapshot } from '../src/lib/snapshot.mjs';
import { fallbackBulletin } from '../src/lib/bulletin-text.mjs';
import { FIRE_BBOX, WIND_BBOX, WIND_STEP_DEG, CITIES } from '../src/lib/regions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../frontend/public/local-latest.json');
const level = process.env.WIND_LEVEL || '925hPa';

console.time('fires');
const { fires, sourcesUsed, errors } = await fetchFires({ mapKey: process.env.FIRMS_MAP_KEY, bbox: FIRE_BBOX });
console.timeEnd('fires');
console.log(`${fires.length} fires from ${sourcesUsed.join(', ')}${errors.length ? ` (errors: ${errors.join('; ')})` : ''}`);

console.time('wind');
const wind = await fetchWindGrid({ bbox: WIND_BBOX, step: WIND_STEP_DEG, level });
console.timeEnd('wind');

let airQuality = {};
try { airQuality = await fetchCityAirQuality({ cities: CITIES }); } catch (e) { console.warn('air quality skipped:', e.message); }

console.time('simulate');
const snapshot = buildSnapshot({ runId: `local-${Date.now()}`, fires, wind, airQuality, meta: { fireSources: sourcesUsed } });
console.timeEnd('simulate');
snapshot.bulletin = { ...fallbackBulletin(snapshot), source: 'template' };

writeFileSync(out, JSON.stringify(snapshot));
console.log(`\nsnapshot -> ${out}\n`);
for (const c of snapshot.cities) {
  console.log(`${c.name.padEnd(11)} ${c.level.padEnd(9)} eta ${String(c.etaHours ?? '-').padStart(5)} h   ${c.sources.slice(0, 2).map((s) => `${s.label} ${s.share}%`).join(', ')}`);
}
console.log('\nTop fire clusters to act on:');
for (const c of snapshot.clusters.slice(0, 5)) console.log(`#${c.priority} ${c.label} (${c.region ?? '?'}) ${c.count} fires, ${(c.peopleDownwind24h / 1e6).toFixed(1)}M people downwind in 24h`);
