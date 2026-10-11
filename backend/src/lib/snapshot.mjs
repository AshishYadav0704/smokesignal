// Turns raw inputs (fires, wind grid, city air quality) into the snapshot the app shows.
import { buildWindField, simulate } from './smoke.mjs';
import { CITIES, PLACES } from './regions.mjs';

const MAX_FIRES_IN_SNAPSHOT = 4000;

export function buildSnapshot({ runId, fires, wind, airQuality = {}, t0, generatedAt = new Date().toISOString(), meta = {}, options = {} }) {
  const field = buildWindField(wind);
  const start = t0 ?? Math.floor(Date.now() / 3600_000) * 3600;
  const result = simulate({ fires, field, cities: CITIES, places: PLACES, t0: start, options });

  const cities = result.cities.map((c) => ({ ...c, airQuality: airQuality[c.slug] || null }));
  const levelRank = { high: 3, moderate: 2, low: 1, none: 0 };
  // Most smoke first; within a level, the cities where the most people live.
  cities.sort((a, b) => levelRank[b.level] - levelRank[a.level] || (b.pop || 0) - (a.pop || 0));

  return {
    runId,
    generatedAt,
    t0: result.t0,
    hours: result.hours,
    windLevel: wind.level,
    sources: {
      fires: meta.fireSources || ['NASA FIRMS VIIRS'],
      wind: 'Open-Meteo forecast API (best-match global models)',
      airQuality: 'Open-Meteo Air Quality API (CAMS global)',
    },
    params: result.params,
    fireStats: result.fireStats,
    fires: [...fires]
      .sort((a, b) => (b.frp || 0) - (a.frp || 0))
      .slice(0, MAX_FIRES_IN_SNAPSHOT)
      .map((f) => [Math.round(f.lat * 1000) / 1000, Math.round(f.lon * 1000) / 1000, Math.round((f.frp || 0) * 10) / 10]),
    clusters: result.clusters,
    trajectories: result.trajectories,
    cities,
    bulletin: null,
    ...(meta.mock ? { mock: true } : {}),
    ...(meta.replay ? { replay: meta.replay } : {}),
  };
}

/** Small summary stored in DynamoDB and passed between pipeline steps. */
export function summarize(snapshot) {
  return {
    runId: snapshot.runId,
    generatedAt: snapshot.generatedAt,
    fires: snapshot.fireStats.count,
    totalFrpMW: snapshot.fireStats.totalFrpMW,
    cities: snapshot.cities.map((c) => ({ slug: c.slug, level: c.level, level24: c.level24, etaHours: c.etaHours })),
  };
}
