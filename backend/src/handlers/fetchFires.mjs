// Step 1a: NASA FIRMS fire detections for the last 24 h -> S3
import { fetchFires } from '../lib/firms.mjs';
import { FIRE_BBOX } from '../lib/regions.mjs';
import { putJson, runPrefix } from '../lib/aws.mjs';

export const handler = async (event) => {
  const { fires, sourcesUsed, errors } = await fetchFires({ mapKey: process.env.FIRMS_MAP_KEY, bbox: FIRE_BBOX });
  const key = await putJson(`${runPrefix(event.runId)}/fires.json`, { fetchedAt: new Date().toISOString(), sourcesUsed, errors, fires });
  console.log(JSON.stringify({ step: 'fetchFires', count: fires.length, sourcesUsed, errors }));
  return { runId: event.runId, startedAt: event.startedAt, key, count: fires.length };
};
