// Step 2: run the smoke-transport model and store the snapshot + per-city history
import { buildSnapshot, summarize } from '../lib/snapshot.mjs';
import { getJson, putJson, putItem, putItems, runPrefix } from '../lib/aws.mjs';

export const handler = async (event) => {
  const [firesDoc, wind, airQuality] = await Promise.all([getJson(event.firesKey), getJson(event.windKey), getJson(event.aqKey)]);
  const generatedAt = new Date().toISOString();

  const t = Date.now();
  const snapshot = buildSnapshot({
    runId: event.runId,
    fires: firesDoc.fires,
    wind,
    airQuality,
    generatedAt,
    meta: { fireSources: firesDoc.sourcesUsed },
  });
  const ms = Date.now() - t;

  const snapshotKey = await putJson(`${runPrefix(event.runId)}/snapshot.json`, snapshot);
  const summary = summarize(snapshot);

  await putItem({ pk: 'RUN', sk: `${generatedAt}#${event.runId}`, snapshotKey, ...summary }, 30);
  await putItems(snapshot.cities.map((c) => ({
    pk: `CITY#${c.slug}`, sk: generatedAt, level: c.level, level24: c.level24, etaHours: c.etaHours, arrivingFrp: c.arrivingFrp,
  })), 30);

  console.log(JSON.stringify({ step: 'simulate', ms, fires: snapshot.fireStats.count, trajectories: snapshot.trajectories.length, cities: summary.cities }));
  return { runId: event.runId, startedAt: event.startedAt, snapshotKey, summary };
};
