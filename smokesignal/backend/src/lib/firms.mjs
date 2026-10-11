// NASA FIRMS active-fire detections (VIIRS satellites).
// API: https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}

export const FIRMS_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];

/** Parse a FIRMS CSV into fire objects. Unknown/extra columns are ignored. */
export function parseFirmsCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length || !lines[0].includes('latitude')) {
    throw new Error(`FIRMS did not return CSV: ${text.slice(0, 120)}`);
  }
  const head = lines[0].split(',').map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const iLat = col('latitude');
  const iLon = col('longitude');
  const iFrp = col('frp');
  const iConf = col('confidence');
  const iDate = col('acq_date');
  const iTime = col('acq_time');
  const iSat = col('satellite');
  const iDn = col('daynight');
  const out = [];
  for (let k = 1; k < lines.length; k++) {
    const r = lines[k].split(',');
    const lat = Number(r[iLat]);
    const lon = Number(r[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const hhmm = String(r[iTime] ?? '').padStart(4, '0');
    out.push({
      lat,
      lon,
      frp: Number(r[iFrp]),
      conf: (r[iConf] ?? '').trim(),
      sat: (r[iSat] ?? '').trim(),
      daynight: (r[iDn] ?? '').trim(),
      at: `${r[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`,
    });
  }
  return out;
}

/** Keep usable detections: drop VIIRS "low" confidence and anything older than maxAgeHours. */
export function filterFires(fires, { now = Date.now(), maxAgeHours = 24 } = {}) {
  const cutoff = now - maxAgeHours * 3600 * 1000;
  return fires.filter((f) => {
    const conf = f.conf.toLowerCase();
    if (conf === 'l' || conf === 'low') return false;
    const n = Number(conf);
    if (Number.isFinite(n) && conf !== '' && n < 30) return false; // MODIS numeric confidence
    const t = Date.parse(f.at);
    return Number.isFinite(t) ? t >= cutoff : true;
  });
}

/** Same fire seen by two satellites minutes apart -> keep one (highest FRP). */
export function dedupeFires(fires, cellDeg = 0.004) {
  const best = new Map();
  for (const f of fires) {
    const key = `${Math.round(f.lat / cellDeg)}:${Math.round(f.lon / cellDeg)}:${f.at.slice(0, 13)}`;
    const prev = best.get(key);
    if (!prev || (f.frp || 0) > (prev.frp || 0)) best.set(key, f);
  }
  return [...best.values()];
}

export async function fetchFires({ mapKey, bbox, days = 2, maxAgeHours = 24, sources = FIRMS_SOURCES, fetchImpl = fetch, now = Date.now() }) {
  if (!mapKey) throw new Error('FIRMS_MAP_KEY is not set');
  const area = [bbox.west, bbox.south, bbox.east, bbox.north].join(',');
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${src}/${area}/${days}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(25_000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`FIRMS ${src} HTTP ${res.status}: ${text.slice(0, 120)}`);
      return parseFirmsCsv(text);
    }),
  );
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw new Error(`All FIRMS sources failed: ${results.map((r) => r.reason?.message).join(' | ')}`);
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  const fires = dedupeFires(filterFires(ok.flatMap((r) => r.value), { now, maxAgeHours }));
  return { fires, sourcesUsed: sources.filter((_, k) => results[k].status === 'fulfilled'), errors };
}
