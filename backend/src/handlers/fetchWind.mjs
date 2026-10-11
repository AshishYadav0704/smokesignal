// Step 1b: 48-hour wind forecast on a 0.5° grid over North India -> S3
import { fetchWindGrid } from '../lib/openmeteo.mjs';
import { WIND_BBOX, WIND_STEP_DEG } from '../lib/regions.mjs';
import { putJson, runPrefix } from '../lib/aws.mjs';

export const handler = async (event) => {
  const level = process.env.WIND_LEVEL || '925hPa';
  const wind = await fetchWindGrid({ bbox: WIND_BBOX, step: WIND_STEP_DEG, level });
  const key = await putJson(`${runPrefix(event.runId)}/wind.json`, wind);
  console.log(JSON.stringify({ step: 'fetchWind', level, points: wind.lats.length * wind.lons.length, hours: wind.times.length }));
  return { runId: event.runId, startedAt: event.startedAt, key };
};
