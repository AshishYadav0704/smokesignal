// Step 1c: CAMS PM2.5 forecast per city -> S3 (optional context; never fails the run)
import { fetchCityAirQuality } from '../lib/openmeteo.mjs';
import { CITIES } from '../lib/regions.mjs';
import { putJson, runPrefix } from '../lib/aws.mjs';

export const handler = async (event) => {
  let data = {};
  try {
    data = await fetchCityAirQuality({ cities: CITIES });
  } catch (err) {
    console.warn(JSON.stringify({ step: 'fetchAirQuality', error: err.message }));
  }
  const key = await putJson(`${runPrefix(event.runId)}/air-quality.json`, data);
  return { runId: event.runId, startedAt: event.startedAt, key };
};
