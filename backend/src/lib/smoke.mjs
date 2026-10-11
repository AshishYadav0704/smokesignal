// SmokeSignal smoke-transport engine.
//
// Pure functions only (no AWS, no network) so it can be unit-tested and run locally.
//
// Method, in plain words:
// 1. Group satellite fire detections into ~10 km clusters and add up their fire
//    radiative power (FRP, megawatts). FRP is a standard proxy for how much smoke a fire makes.
// 2. Release "smoke parcels" from each cluster now, +3 h and +6 h (fields keep burning).
// 3. Move every parcel with the forecast wind (bilinear in space, linear in time,
//    2nd-order Runge-Kutta, 10-minute steps) for up to 48 hours.
// 4. Smoke dilutes and settles as it travels, so each parcel's weight decays with age.
// 5. A parcel that passes within ~35 km of a city counts as smoke arriving there.
// 6. Sum arrivals per city -> ETA, peak window, smoke load, and which clusters it came from.
//
// This is a simplified Lagrangian trajectory model (the same idea as NOAA HYSPLIT
// trajectories, without dispersion or vertical motion). It estimates WHEN and FROM WHERE
// smoke arrives; it does not estimate PM2.5 concentrations.

const M_PER_DEG = 111_320;
const DEG = Math.PI / 180;

export const DEFAULTS = {
  hours: 48, // how far ahead we simulate
  stepMinutes: 10, // integration step
  releases: [0, 3, 6], // hours after now at which each cluster emits a parcel
  clusterDeg: 0.1, // ~10 km cluster cells
  maxClusters: 150, // clusters simulated (largest by FRP)
  arrivalKm: 35, // parcel within this distance of a city = arrival
  decayHours: 36, // e-folding time for dilution / deposition
  labelKm: 40, // max distance to name a cluster "near X"
  // Smoke level = fire radiative power (MW) whose smoke reaches the city, after dilution.
  // One crop-residue fire seen by VIIRS is typically a few MW (often 3-10 MW), so roughly:
  // light = smoke of a few fires, moderate = 10-30 fires, heavy = 50-100+ fires.
  levels: { low: 20, moderate: 100, high: 500 },
  etaFraction: 0.1, // ETA = when 10% of the expected smoke load has arrived
};

// ---------- geometry ----------

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Meteorological convention: direction is where the wind blows FROM.
export function windToUV(speed, dirDeg) {
  return { u: -speed * Math.sin(dirDeg * DEG), v: -speed * Math.cos(dirDeg * DEG) };
}

// ---------- wind field ----------

/**
 * Build a wind field from a regular lat/lon grid.
 * @param {object} g { lats[], lons[], times[] (unix s), speed[], dir[] } flat arrays indexed (t*ni + i)*nj + j
 */
export function buildWindField(g) {
  const ni = g.lats.length;
  const nj = g.lons.length;
  const nt = g.times.length;
  const n = nt * ni * nj;
  if (g.speed.length !== n || g.dir.length !== n) throw new Error(`wind arrays must have ${n} values`);
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const s = g.speed[k];
    const d = g.dir[k];
    if (s == null || d == null || Number.isNaN(s) || Number.isNaN(d)) continue; // stays 0 (calm)
    const w = windToUV(s, d);
    u[k] = w.u;
    v[k] = w.v;
  }
  return {
    lats: g.lats, lons: g.lons, times: g.times, ni, nj, nt, u, v,
    dLat: ni > 1 ? g.lats[1] - g.lats[0] : 1,
    dLon: nj > 1 ? g.lons[1] - g.lons[0] : 1,
    dt: nt > 1 ? g.times[1] - g.times[0] : 3600,
  };
}

function bilinear(arr, f, t, i0, j0, fy, fx) {
  const base = (t * f.ni + i0) * f.nj + j0;
  const a = arr[base];
  const b = arr[base + 1];
  const c = arr[base + f.nj];
  const d = arr[base + f.nj + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Wind (m/s) at a point and time, or null if outside the grid. */
export function sampleWind(f, lat, lon, tSec) {
  const { lats, lons, ni, nj, nt } = f;
  if (lat < lats[0] || lat > lats[ni - 1] || lon < lons[0] || lon > lons[nj - 1]) return null;
  const i0 = Math.min(Math.floor((lat - lats[0]) / f.dLat), ni - 2);
  const j0 = Math.min(Math.floor((lon - lons[0]) / f.dLon), nj - 2);
  const fy = (lat - lats[i0]) / f.dLat;
  const fx = (lon - lons[j0]) / f.dLon;
  let t0;
  let ft;
  if (nt === 1 || tSec <= f.times[0]) { t0 = 0; ft = 0; } else if (tSec >= f.times[nt - 1]) { t0 = nt - 2; ft = 1; } else {
    t0 = Math.min(Math.floor((tSec - f.times[0]) / f.dt), nt - 2);
    ft = (tSec - f.times[t0]) / f.dt;
  }
  const t1 = nt === 1 ? 0 : t0 + 1;
  const u = bilinear(f.u, f, t0, i0, j0, fy, fx) * (1 - ft) + bilinear(f.u, f, t1, i0, j0, fy, fx) * ft;
  const v = bilinear(f.v, f, t0, i0, j0, fy, fx) * (1 - ft) + bilinear(f.v, f, t1, i0, j0, fy, fx) * ft;
  return { u, v };
}

function move(lat, lon, w, dtSec) {
  return {
    lat: lat + (w.v * dtSec) / M_PER_DEG,
    lon: lon + (w.u * dtSec) / (M_PER_DEG * Math.cos(lat * DEG)),
  };
}

/** One RK2 (midpoint) step. Returns null if the parcel leaves the grid. */
export function advect(f, lat, lon, tSec, dtSec) {
  const w1 = sampleWind(f, lat, lon, tSec);
  if (!w1) return null;
  const mid = move(lat, lon, w1, dtSec / 2);
  const w2 = sampleWind(f, mid.lat, mid.lon, tSec + dtSec / 2);
  if (!w2) return null;
  return move(lat, lon, w2, dtSec);
}

// ---------- fires ----------

/** Group fire detections into grid-cell clusters, largest FRP first. */
export function clusterFires(fires, cellDeg = DEFAULTS.clusterDeg) {
  const cells = new Map();
  for (const f of fires) {
    const frp = Number.isFinite(f.frp) && f.frp > 0 ? f.frp : 1;
    const key = `${Math.floor(f.lat / cellDeg)}:${Math.floor(f.lon / cellDeg)}`;
    let c = cells.get(key);
    if (!c) { c = { count: 0, frp: 0, sLat: 0, sLon: 0 }; cells.set(key, c); }
    c.count += 1;
    c.frp += frp;
    c.sLat += f.lat * frp;
    c.sLon += f.lon * frp;
  }
  return [...cells.values()]
    .map((c) => ({ lat: c.sLat / c.frp, lon: c.sLon / c.frp, count: c.count, frp: c.frp }))
    .sort((a, b) => b.frp - a.frp)
    .map((c, k) => ({ id: `c${k + 1}`, ...c }));
}

export function labelFor(lat, lon, places, maxKm = DEFAULTS.labelKm) {
  let best = null;
  for (const p of places) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (!best || d < best.d) best = { d, p };
  }
  // Country of the nearest district HQ: a good approximation near the Punjab border.
  const country = best && best.p.region === 'Pakistan' ? 'PK' : 'IN';
  if (!best || best.d > maxKm) return { label: `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`, region: null, country };
  return { label: `near ${best.p.name}`, region: best.p.region, place: best.p.name, km: Math.round(best.d), country };
}

// ---------- simulation ----------

function levelFor(frp, levels) {
  if (frp < levels.low) return 'none';
  if (frp < levels.moderate) return 'low';
  if (frp < levels.high) return 'moderate';
  return 'high';
}

const round3 = (x) => Math.round(x * 1000) / 1000;
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * Run the smoke-transport simulation.
 * @param {object} p
 * @param {Array<{lat,lon,frp}>} p.fires  fire detections
 * @param {object} p.field                from buildWindField
 * @param {Array} p.cities                [{slug,name,lat,lon,pop}]
 * @param {Array} [p.places]              labels for clusters
 * @param {number} p.t0                   unix seconds the forecast starts
 * @param {object} [p.options]
 */
export function simulate({ fires, field, cities, places = [], t0, options = {} }) {
  const o = { ...DEFAULTS, ...options, levels: { ...DEFAULTS.levels, ...(options.levels || {}) } };
  const dtSec = o.stepMinutes * 60;
  const stepsPerHour = Math.round(60 / o.stepMinutes);
  const tEnd = t0 + o.hours * 3600;

  const allClusters = clusterFires(fires, o.clusterDeg);
  const clusters = allClusters.slice(0, o.maxClusters).map((c) => ({ ...c, ...labelFor(c.lat, c.lon, places, o.labelKm) }));

  const arrivals = cities.map(() => []); // per city: {cluster, hours, w}
  const trajectories = [];

  for (const c of clusters) {
    const w0 = c.frp / o.releases.length;
    for (const r of o.releases) {
      let lat = c.lat;
      let lon = c.lon;
      let t = t0 + r * 3600;
      const pts = [[round3(lat), round3(lon)]];
      const arrived = new Set();
      let exited = false;
      let step = 0;
      while (t < tEnd) {
        // arrival check at current position
        for (let k = 0; k < cities.length; k++) {
          if (arrived.has(k)) continue;
          if (haversineKm(lat, lon, cities[k].lat, cities[k].lon) <= o.arrivalKm) {
            arrived.add(k);
            const ageH = (t - (t0 + r * 3600)) / 3600;
            arrivals[k].push({ cluster: c.id, hours: (t - t0) / 3600, w: w0 * Math.exp(-ageH / o.decayHours) });
          }
        }
        const next = advect(field, lat, lon, t, dtSec);
        if (!next) { exited = true; break; }
        lat = next.lat;
        lon = next.lon;
        t += dtSec;
        step += 1;
        if (step % stepsPerHour === 0) pts.push([round3(lat), round3(lon)]);
      }
      trajectories.push({ c: c.id, r, w: round1(w0), pts, exited });
    }
  }

  // ---- per-city results ----
  const clusterById = Object.fromEntries(clusters.map((c) => [c.id, c]));
  const reach24 = new Map(clusters.map((c) => [c.id, new Set()]));
  const impact = new Map(clusters.map((c) => [c.id, 0]));

  const cityResults = cities.map((city, k) => {
    const arr = arrivals[k].sort((a, b) => a.hours - b.hours);
    const total = arr.reduce((s, a) => s + a.w, 0);
    const total24 = arr.filter((a) => a.hours <= 24).reduce((s, a) => s + a.w, 0);

    let etaHours = null;
    let cum = 0;
    for (const a of arr) {
      cum += a.w;
      if (cum >= o.etaFraction * total) { etaHours = round1(a.hours); break; }
    }

    const bins = new Array(Math.ceil(o.hours / 6)).fill(0);
    for (const a of arr) bins[Math.min(bins.length - 1, Math.floor(a.hours / 6))] += a.w;
    let peak = null;
    bins.forEach((w, b) => { if (w > 0 && (!peak || w > peak.frp)) peak = { start: b * 6, end: b * 6 + 6, frp: round1(w) }; });

    const byCluster = new Map();
    for (const a of arr) {
      byCluster.set(a.cluster, (byCluster.get(a.cluster) || 0) + a.w);
      if (a.hours <= 24) reach24.get(a.cluster).add(k);
      impact.set(a.cluster, impact.get(a.cluster) + a.w * (city.pop || 0) / 1e6);
    }
    // Group sources by area label so several clusters near one district show as one line.
    const byArea = new Map();
    for (const [id, w] of byCluster) {
      const c = clusterById[id];
      const area = byArea.get(c.label) || { label: c.label, region: c.region || null, w: 0, clusters: [] };
      area.w += w;
      area.clusters.push(id);
      byArea.set(c.label, area);
    }
    const sources = [...byArea.values()]
      .sort((x, y) => y.w - x.w)
      .slice(0, 5)
      .map((s) => ({ label: s.label, region: s.region, share: total ? Math.round((s.w / total) * 100) : 0, clusters: s.clusters }));

    return {
      slug: city.slug, name: city.name, hi: city.hi, lat: city.lat, lon: city.lon, pop: city.pop,
      level: levelFor(total, o.levels),
      level24: levelFor(total24, o.levels),
      etaHours,
      firstContactHours: arr.length ? round1(arr[0].hours) : null,
      arrivingFrp: round1(total),
      arrivingFrp24: round1(total24),
      peakWindow: peak,
      sources,
    };
  });

  // ---- which fires matter most: people-weighted smoke delivered to cities ----
  // Fires to act on first: only fires in India are ranked; fires across the border still
  // count as smoke sources for each city above.
  const ranked = clusters
    .map((c) => {
      const reached = [...reach24.get(c.id)].map((k) => cities[k]);
      return {
        id: c.id, lat: round3(c.lat), lon: round3(c.lon), count: c.count, frp: round1(c.frp),
        label: c.label, region: c.region || null, country: c.country,
        impact: round1(impact.get(c.id)),
        citiesReached24h: reached.map((x) => x.name),
        peopleDownwind24h: reached.reduce((s, x) => s + (x.pop || 0), 0),
      };
    })
    .sort((a, b) => (a.country === 'PK') - (b.country === 'PK') || b.impact - a.impact || b.frp - a.frp);
  let rank = 0;
  for (const c of ranked) c.priority = c.country === 'PK' ? null : ++rank;

  const totalFrp = fires.reduce((s, f) => s + (Number.isFinite(f.frp) && f.frp > 0 ? f.frp : 1), 0);

  return {
    t0,
    hours: o.hours,
    params: { stepMinutes: o.stepMinutes, releases: o.releases, arrivalKm: o.arrivalKm, decayHours: o.decayHours, levels: o.levels, clusterKm: Math.round(o.clusterDeg * 111) },
    fireStats: { count: fires.length, totalFrpMW: round1(totalFrp), clusters: allClusters.length, simulatedClusters: clusters.length },
    clusters: ranked,
    trajectories,
    cities: cityResults,
  };
}
