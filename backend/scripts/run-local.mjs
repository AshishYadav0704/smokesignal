// Run the whole pipeline on your laptop with REAL data (no AWS needed).
//
// Live forecast (writes frontend/public/local-latest.json):
//   FIRMS_MAP_KEY=xxxx node scripts/run-local.mjs
//
// Replay a past day from the archives (writes frontend/public/replay.json, shown in the app as "Replay"):
//   FIRMS_MAP_KEY=xxxx REPLAY_DATE=2025-11-11 node scripts/run-local.mjs
//   REPLAY_HOUR_IST (default 17) sets the time of day the replay starts, after the afternoon satellite pass.
//
// Windows PowerShell: $env:FIRMS_MAP_KEY="xxxx"; $env:REPLAY_DATE="2025-11-11"; npm run local
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchFires, fetchFiresForReplay } from '../src/lib/firms.mjs';
import { fetchWindGrid, fetchCityAirQuality } from '../src/lib/openmeteo.mjs';
import { buildSnapshot } from '../src/lib/snapshot.mjs';
import { fallbackBulletin } from '../src/lib/bulletin-text.mjs';
import { FIRE_BBOX, WIND_BBOX, WIND_STEP_DEG, CITIES } from '../src/lib/regions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const level = process.env.WIND_LEVEL || '925hPa';
const replayDate = (process.env.REPLAY_DATE || '').trim();
const mapKey = process.env.FIRMS_MAP_KEY;

let startSec = null;
if (replayDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(replayDate)) throw new Error('REPLAY_DATE must look like 2025-11-11');
  const hourIst = Number(process.env.REPLAY_HOUR_IST ?? 17);
  startSec = Math.floor(Date.parse(`${replayDate}T00:00:00Z`) / 1000) + Math.round((hourIst - 5.5) * 3600);
  if (startSec > Date.now() / 1000 - 3 * 86400) throw new Error('REPLAY_DATE must be at least 3 days ago');
  console.log(`REPLAY of ${replayDate} from ${hourIst}:00 IST, using archived fires and winds\n`);
}
const out = resolve(here, `../../frontend/public/${startSec ? 'replay.json' : 'local-latest.json'}`);

console.time('fires');
const { fires, sourcesUsed, errors } = startSec
  ? await fetchFiresForReplay({ mapKey, bbox: FIRE_BBOX, replaySec: startSec })
  : await fetchFires({ mapKey, bbox: FIRE_BBOX });
console.timeEnd('fires');
console.log(`${fires.length} fires from ${sourcesUsed.join(', ') || 'no source'}${errors.length ? ` (errors: ${errors.join('; ')})` : ''}`);
if (!fires.length && startSec) console.log('No archived fires found for that date. Try another date (Oct-Nov, 2023-2025).');

console.time('wind');
const wind = await fetchWindGrid({ bbox: WIND_BBOX, step: WIND_STEP_DEG, level, startSec });
console.timeEnd('wind');

let airQuality = {};
try { airQuality = await fetchCityAirQuality({ cities: CITIES, startSec }); } catch (e) { console.warn('air quality skipped:', e.message); }

console.time('simulate');
const snapshot = buildSnapshot({
  runId: startSec ? `replay-${replayDate}` : `local-${Date.now()}`,
  fires,
  wind,
  airQuality,
  t0: startSec ?? undefined,
  generatedAt: startSec ? new Date(startSec * 1000).toISOString() : undefined,
  meta: { fireSources: sourcesUsed, ...(startSec ? { replay: { date: replayDate } } : {}) },
});
console.timeEnd('simulate');
snapshot.bulletin = { ...fallbackBulletin(snapshot), source: 'template' };

writeFileSync(out, JSON.stringify(snapshot));
console.log(`\nsnapshot -> ${out}\n`);
for (const c of snapshot.cities) {
  console.log(`${c.name.padEnd(11)} ${c.level.padEnd(9)} eta ${String(c.etaHours ?? '-').padStart(5)} h   ${c.sources.slice(0, 2).map((s) => `${s.label} ${s.share}%`).join(', ')}`);
}
console.log('\nTop fire clusters to act on:');
for (const c of snapshot.clusters.filter((x) => x.priority).slice(0, 5)) console.log(`#${c.priority} ${c.label} (${c.region ?? '?'}) ${c.count} fires, ${(c.peopleDownwind24h / 1e6).toFixed(1)}M people downwind in 24h`);
