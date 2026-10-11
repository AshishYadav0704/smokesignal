// Bulletin text: the prompt we send to Amazon Bedrock, and a template fallback
// so the app still works if the model is unavailable. Numbers always come from
// the simulation; the model only turns them into readable English and Hindi.

const LEVEL_EN = { none: 'no significant', low: 'light', moderate: 'moderate', high: 'heavy' };
const LEVEL_HI = { none: 'कोई खास नहीं', low: 'हल्का', moderate: 'मध्यम', high: 'भारी' };

export function formatIST(isoOrSec) {
  const d = typeof isoOrSec === 'number' ? new Date(isoOrSec * 1000) : new Date(isoOrSec);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
}

/** Facts the bulletin is allowed to use. */
export function bulletinFacts(s) {
  const affected = s.cities.filter((c) => c.level !== 'none');
  return {
    issued: formatIST(s.generatedAt),
    firesLast24h: s.fireStats.count,
    totalFirePowerMW: Math.round(s.fireStats.totalFrpMW),
    cities: affected.map((c) => ({
      city: c.name,
      smoke: c.level,
      arrivesInHours: c.etaHours,
      peakHoursFromNow: c.peakWindow ? `${c.peakWindow.start}-${c.peakWindow.end}` : null,
      mainSources: c.sources.slice(0, 2).map((x) => `${x.label}${x.region ? `, ${x.region}` : ''} (${x.share}%)`),
      camsPm25Max48h: c.airQuality?.pm25?.length ? Math.round(Math.max(...c.airQuality.pm25.filter((v) => v != null))) : null,
    })),
    clearCities: s.cities.filter((c) => c.level === 'none').map((c) => c.name),
    topFiresToActOn: s.clusters.filter((c) => c.priority).slice(0, 3).map((c) => ({ where: c.label, region: c.region, fires: c.count, peopleDownwind24h: c.peopleDownwind24h })),
  };
}

export const SYSTEM_PROMPT = `You write short public smoke bulletins for people in North India.
Rules:
- Use ONLY the facts in the JSON you are given. Never invent numbers, places or times.
- Say it is a forecast estimate, not a measurement.
- Mention the most affected cities, roughly when smoke arrives, and the main source areas.
- Give 2 practical actions (e.g. keep windows shut during the peak hours, move children's outdoor play and exercise outside the peak, people with asthma keep medicines handy). No medical diagnosis.
- English: at most 90 words. Hindi: same content in simple Devanagari Hindi, at most 90 words.
- Reply with JSON only: {"en": "...", "hi": "..."}`;

export function buildUserPrompt(snapshot) {
  return `Facts:\n${JSON.stringify(bulletinFacts(snapshot), null, 1)}`;
}

/** Pull {"en","hi"} out of a model reply, tolerating code fences or extra text. */
export function parseModelJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  const j = JSON.parse(m[0]);
  if (typeof j.en !== 'string' || typeof j.hi !== 'string' || !j.en.trim() || !j.hi.trim()) throw new Error('model JSON missing en/hi');
  return { en: j.en.trim(), hi: j.hi.trim() };
}

export function fallbackBulletin(s) {
  const issued = formatIST(s.generatedAt);
  const affected = s.cities.filter((c) => c.level !== 'none').slice(0, 3);
  const n = s.fireStats.count;
  if (!affected.length) {
    return {
      en: `SmokeSignal (${issued}): ${n} farm fires detected in the last 24 h. Forecast winds do not carry significant smoke to the tracked cities in the next 48 h. This is a model estimate, not a measurement.`,
      hi: `स्मोकसिग्नल (${issued}): पिछले 24 घंटों में ${n} खेतों में आग दर्ज हुई। अगले 48 घंटों में हवा का रुख़ इन शहरों तक खास धुआँ नहीं ला रहा है। यह एक अनुमान है, माप नहीं।`,
    };
  }
  const en = affected.map((c) => `${c.name}: ${LEVEL_EN[c.level]} smoke from ~${c.etaHours ?? '?'} h${c.peakWindow ? `, peak ${c.peakWindow.start}–${c.peakWindow.end} h from now` : ''}${c.sources[0] ? ` (mostly ${c.sources[0].label})` : ''}.`).join(' ');
  const hi = affected.map((c) => `${c.hi || c.name}: लगभग ${c.etaHours ?? '?'} घंटे बाद से ${LEVEL_HI[c.level]} धुआँ${c.peakWindow ? `, सबसे ज़्यादा ${c.peakWindow.start}–${c.peakWindow.end} घंटे बाद` : ''}।`).join(' ');
  return {
    en: `SmokeSignal (${issued}): ${n} farm fires in the last 24 h. ${en} Keep windows shut during the peak and move children's outdoor play and exercise outside it. Estimate from satellite fires + forecast winds.`,
    hi: `स्मोकसिग्नल (${issued}): पिछले 24 घंटों में ${n} खेतों में आग। ${hi} धुएँ के समय खिड़कियाँ बंद रखें और बच्चों का बाहर खेलना व व्यायाम उस समय से हटा दें। यह उपग्रह आँकड़ों और हवा के पूर्वानुमान पर आधारित अनुमान है।`,
  };
}
