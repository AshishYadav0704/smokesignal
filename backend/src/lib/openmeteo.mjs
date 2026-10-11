// Open-Meteo: wind forecast on a grid (for smoke transport) and CAMS PM2.5 forecast per city.
// Docs: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/air-quality-api

export function makeGrid(bbox, step) {
  const lats = [];
  const lons = [];
  for (let la = bbox.south; la <= bbox.north + 1e-9; la += step) lats.push(Math.round(la * 1000) / 1000);
  for (let lo = bbox.west; lo <= bbox.east + 1e-9; lo += step) lons.push(Math.round(lo * 1000) / 1000);
  const points = [];
  lats.forEach((lat, i) => lons.forEach((lon, j) => points.push({ lat, lon, i, j })));
  return { lats, lons, points };
}

function chunk(arr, n) {
  const out = [];
  for (let k = 0; k < arr.length; k += n) out.push(arr.slice(k, k + n));
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * GET JSON from Open-Meteo. The free API sometimes answers 503 "overloaded" or 429,
 * so retry those (and network errors) with exponential backoff: 3, 6, 12, 24, 48 s
 * (long enough to outlast the free tier's per-minute limit).
 */
export async function getJson(url, fetchImpl = fetch, { retries = 5, baseDelayMs = 3000, sleepImpl = sleep } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    let body;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(45_000) });
      body = await res.json().catch(() => ({}));
    } catch (err) {
      if (attempt >= retries) throw new Error(`Open-Meteo request failed: ${err.message}`);
      console.warn(`Open-Meteo request failed (${err.message}), retrying`);
      await sleepImpl(baseDelayMs * 2 ** attempt);
      continue;
    }
    if (res.ok && !body.error) return Array.isArray(body) ? body : [body];
    const msg = `Open-Meteo ${res.status}: ${body.reason || JSON.stringify(body).slice(0, 120)}`;
    if (!RETRYABLE.has(res.status) || attempt >= retries) throw new Error(msg);
    console.warn(`${msg} - retrying in ${(baseDelayMs * 2 ** attempt) / 1000} s`);
    await sleepImpl(baseDelayMs * 2 ** attempt);
  }
}

/**
 * Hourly wind forecast for every grid point.
 * level: '925hPa' (~500 m above the Punjab plains, where smoke travels), '850hPa', '10m', '120m'...
 * Returns flat arrays indexed (t*ni + i)*nj + j, ready for buildWindField().
 */
const ymd = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);

/** Keep `hours` time steps starting at startSec from flat (t, i, j) arrays. */
export function sliceTimes(g, startSec, hours) {
  const n = g.lats.length * g.lons.length;
  const o = g.times.findIndex((t) => t >= startSec);
  if (o < 0) throw new Error('No wind data at the replay time');
  const nt = Math.min(hours, g.times.length - o);
  if (nt < 2) throw new Error('Not enough wind data after the replay time');
  return { ...g, times: g.times.slice(o, o + nt), speed: g.speed.slice(o * n, (o + nt) * n), dir: g.dir.slice(o * n, (o + nt) * n) };
}

/**
 * startSec: null = live forecast from now; a unix time = replay, using the forecast archive
 * (Open-Meteo Historical Forecast API, 2022 onwards).
 */
export async function fetchWindGrid({
  bbox, step, level = '925hPa', hours = 49, chunkSize = 50, pauseMs = 1500, fetchImpl = fetch, retry = {}, startSec = null,
}) {
  const { lats, lons, points } = makeGrid(bbox, step);
  const base = startSec ? 'https://historical-forecast-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast';
  const timeParams = startSec
    ? `&start_date=${ymd(startSec)}&end_date=${ymd(startSec + (hours + 24) * 3600)}`
    : `&forecast_hours=${hours}`;
  const ni = lats.length;
  const nj = lons.length;
  let times = null;
  let speed = null;
  let dir = null;

  const parts = chunk(points, chunkSize);
  for (const [n, part] of parts.entries()) {
    if (n > 0 && pauseMs) await (retry.sleepImpl || sleep)(pauseMs); // be gentle with the free API
    const url = base
      + `?latitude=${part.map((p) => p.lat).join(',')}`
      + `&longitude=${part.map((p) => p.lon).join(',')}`
      + `&hourly=wind_speed_${level},wind_direction_${level}`
      + `&wind_speed_unit=ms${timeParams}&timeformat=unixtime&timezone=GMT&cell_selection=nearest`;
    const rows = await getJson(url, fetchImpl, retry);
    if (rows.length !== part.length) throw new Error(`Open-Meteo returned ${rows.length} locations, expected ${part.length}`);
    rows.forEach((row, k) => {
      const p = part[k];
      const h = row.hourly;
      if (!times) {
        times = h.time;
        speed = new Array(times.length * ni * nj).fill(null);
        dir = new Array(times.length * ni * nj).fill(null);
      }
      const sp = h[`wind_speed_${level}`];
      const dr = h[`wind_direction_${level}`];
      for (let t = 0; t < times.length; t++) {
        const idx = (t * ni + p.i) * nj + p.j;
        speed[idx] = sp[t];
        dir[idx] = dr[t];
      }
    });
  }
  const grid = { level, lats, lons, times, speed, dir };
  return startSec ? sliceTimes(grid, startSec, hours) : grid;
}

/** CAMS model PM2.5 forecast for each city (context next to our smoke ETA). */
export async function fetchCityAirQuality({ cities, fetchImpl = fetch, nowSec = Math.floor(Date.now() / 1000), retry = {}, startSec = null }) {
  if (startSec) nowSec = startSec;
  const timeParams = startSec ? `&start_date=${ymd(startSec)}&end_date=${ymd(startSec + 72 * 3600)}` : '&forecast_days=3';
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
    + `?latitude=${cities.map((c) => c.lat).join(',')}`
    + `&longitude=${cities.map((c) => c.lon).join(',')}`
    + `&hourly=pm2_5${timeParams}&timeformat=unixtime&timezone=GMT`;
  const rows = await getJson(url, fetchImpl, retry);
  const startHour = Math.floor(nowSec / 3600) * 3600;
  const byCity = {};
  rows.forEach((row, k) => {
    const t = row.hourly.time;
    const v = row.hourly.pm2_5;
    const keep = t.map((x, n) => [x, v[n]]).filter(([x]) => x >= startHour).slice(0, 49);
    byCity[cities[k].slug] = { times: keep.map((x) => x[0]), pm25: keep.map((x) => x[1]) };
  });
  return byCity;
}
