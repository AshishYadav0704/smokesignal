// Alert rules and email text (pure, unit-tested).
const RANK = { none: 0, low: 1, moderate: 2, high: 3 };
const WORD = { none: 'NO', low: 'LIGHT', moderate: 'MODERATE', high: 'HEAVY' };
const COOLDOWN_MS = 12 * 3600 * 1000;

/** Alert when moderate/heavy smoke arrives within the window; at most once per 12 h unless it gets worse. */
export function shouldAlert(city, last, { now = Date.now(), windowHours = 24 } = {}) {
  if (RANK[city.level24] < RANK.moderate || city.etaHours == null || city.etaHours > windowHours) return false;
  if (!last) return true;
  const recent = now - Date.parse(last.sentAt) < COOLDOWN_MS;
  return !recent || RANK[city.level24] > RANK[last.level];
}

const replayTag = (snapshot) => (snapshot?.replay ? `[TEST - replay of ${snapshot.replay.date}] ` : '');

/** SNS subjects must be ASCII and under 100 characters. */
export function alertSubject(city, snapshot) {
  const when = city.etaHours < 1 ? `reaching ${city.name} now` : `heading to ${city.name} in ~${Math.round(city.etaHours)} h`;
  return `${replayTag(snapshot)}SmokeSignal: ${WORD[city.level24].toLowerCase()} smoke ${when}`
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 99);
}

export function alertMessage(city, snapshot, appUrl) {
  const pm = city.airQuality?.pm25?.filter((v) => v != null) ?? [];
  const lines = [
    snapshot?.replay ? `TEST ALERT: replay of ${snapshot.replay.date} using archived satellite fires and that day's wind forecast. This is not a current forecast.` : '',
    snapshot?.replay ? '' : '',
    `Smoke alert for ${city.name} (SmokeSignal)`,
    '',
    `Expected: ${WORD[city.level24]} smoke, ${city.etaHours < 1 ? 'arriving now' : `arriving in about ${Math.round(city.etaHours)} hours`}${city.peakWindow ? ` (heaviest ${city.peakWindow.start}-${city.peakWindow.end} h from now)` : ''}.`,
    city.sources.length ? `Main sources: ${city.sources.slice(0, 3).map((s) => `${s.label}${s.region ? `, ${s.region}` : ''} (${s.share}%)`).join('; ')}.` : '',
    pm.length ? `CAMS PM2.5 forecast, max next 48 h: ${Math.round(Math.max(...pm))} µg/m³.` : '',
    '',
    snapshot.bulletin?.en ?? '',
    '',
    snapshot.bulletin?.hi ?? '',
    '',
    appUrl ? `Live map: ${appUrl}` : '',
    'Forecast estimate from NASA satellite fire detections and forecast winds, not a measurement.',
  ];
  return lines.filter((l, k, a) => l !== '' || (k > 0 && a[k - 1] !== '')).join('\n').trim();
}
