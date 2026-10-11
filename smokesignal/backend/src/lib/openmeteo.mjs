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

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`Open-Meteo ${res.status}: ${body.reason || JSON.stringify(body).slice(0, 120)}`);
  return Array.isArray(body) ? body : [body];
}

/**
 * Hourly wind forecast for every grid point.
 * level: '925hPa' (~500 m above the Punjab plains, where smoke travels), '850hPa', '10m', '120m'...
 * Returns flat arrays indexed (t*ni + i)*nj + j, ready for buildWindField().
 */
export async function fetchWindGrid({ bbox, step, level = '925hPa', hours = 49, chunkSize = 100, fetchImpl = fetch }) {
  const { lats, lons, points } = makeGrid(bbox, step);
  const ni = lats.length;
  const nj = lons.length;
  let times = null;
  let speed = null;
  let dir = null;

  for (const part of chunk(points, chunkSize)) {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${part.map((p) => p.lat).join(',')}`
      + `&longitude=${part.map((p) => p.lon).join(',')}`
      + `&hourly=wind_speed_${level},wind_direction_${level}`
      + `&wind_speed_unit=ms&forecast_hours=${hours}&timeformat=unixtime&timezone=GMT&cell_selection=nearest`;
    const rows = await getJson(url, fetchImpl);
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
  return { level, lats, lons, times, speed, dir };
}

/** CAMS model PM2.5 forecast for each city (context next to our smoke ETA). */
export async function fetchCityAirQuality({ cities, fetchImpl = fetch, nowSec = Math.floor(Date.now() / 1000) }) {
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
    + `?latitude=${cities.map((c) => c.lat).join(',')}`
    + `&longitude=${cities.map((c) => c.lon).join(',')}`
    + '&hourly=pm2_5&forecast_days=3&timeformat=unixtime&timezone=GMT';
  const rows = await getJson(url, fetchImpl);
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
