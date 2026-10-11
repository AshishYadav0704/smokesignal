import { useState } from 'react';
import { LEVELS, clockAt, hoursText } from '../lib/format.js';

/** Plain steps for the level of smoke on its way. */
function adviceFor(level, when) {
  if (level === 'high') {
    return [
      `Keep windows and doors shut ${when}. Run an air purifier if you have one.`,
      'Move morning walks, sport and school outdoor activity out of that window.',
      'If you must go out, wear an N95 mask; cloth masks do not stop smoke. Children, older people and anyone with asthma or heart disease should stay indoors.',
    ];
  }
  if (level === 'moderate') {
    return [
      `Close windows ${when}.`,
      'Cut down long or hard outdoor exercise during that time.',
      'People with asthma or heart or lung disease should keep their medicines at hand.',
    ];
  }
  return [
    'Most people will not need to change plans.',
    `If you have asthma or a lung condition, you may notice it ${when}.`,
  ];
}

function ShareButton({ text }) {
  const [note, setNote] = useState('');
  const onShare = async () => {
    const url = window.location.href;
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && navigator.share) {
      try { await navigator.share({ title: 'SmokeSignal', text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote('Link copied');
    } catch {
      setNote(url);
    }
    setTimeout(() => setNote(''), 4000);
  };
  return (
    <>
      <button type="button" className="btn-quiet share" onClick={onShare}>Share</button>
      {note && <span className="share-note" role="status">{note}</span>}
    </>
  );
}

function Pm25Chart({ aq, t0, hour }) {
  const values = aq?.pm25?.map((v, i) => [(aq.times[i] - t0) / 3600, v]).filter(([h, v]) => v != null && h >= 0 && h <= 48);
  if (!values?.length) return null;
  const W = 300;
  const H = 64;
  const max = Math.max(60, ...values.map(([, v]) => v));
  const x = (h) => (h / 48) * W;
  const y = (v) => H - (v / max) * (H - 6) - 2;
  const d = values.map(([h, v], k) => `${k ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const peak = values.reduce((a, b) => (b[1] > a[1] ? b : a));
  return (
    <figure className="pm">
      <figcaption>
        Independent check: CAMS model PM2.5 forecast, peaking at {Math.round(peak[1])} µg/m³ around {clockAt(t0, peak[0])}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="PM2.5 forecast for the next 48 hours">
        <line className="pm-guide" x1="0" x2={W} y1={y(60)} y2={y(60)} />
        <path className="pm-line" d={d} />
        <line className="pm-now" x1={x(hour)} x2={x(hour)} y1="0" y2={H} />
      </svg>
      <div className="pm-axis" aria-hidden="true"><span>Now</span><span>dashed line: 60 µg/m³, India's 24-hour standard</span><span>+48 h</span></div>
    </figure>
  );
}

export default function CityAnswer({ snapshot, city, onSelectCity, hour }) {
  const lvl = LEVELS[city.level];
  const clear = city.level === 'none';
  const when = city.peakWindow
    ? `between ${clockAt(snapshot.t0, city.peakWindow.start)} and ${clockAt(snapshot.t0, city.peakWindow.end)}`
    : 'while the smoke is overhead';
  const line = clear
    ? `No farm-fire smoke expected in ${city.name} in the next 48 hours.`
    : city.etaHours < 1
      ? `${lvl.word} smoke is reaching ${city.name} now.`
      : `${lvl.word} smoke reaches ${city.name} in about ${hoursText(city.etaHours)}, around ${clockAt(snapshot.t0, city.etaHours)}.`;
  return (
    <section className="answer" aria-live="polite">
      <div className="answer-top">
        <label className="city-pick">
          <span className="visually-hidden">Choose a city</span>
          <select value={city.slug} onChange={(e) => onSelectCity(e.target.value)}>
            {snapshot.cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name} ({LEVELS[c.level].label.toLowerCase()})</option>
            ))}
          </select>
        </label>
        <ShareButton text={`${line} (SmokeSignal forecast)`} />
      </div>

      {clear ? (
        <>
          <p className="eta eta-clear">Clear</p>
          <h2 className="answer-line">{line}</h2>
        </>
      ) : (
        <>
          <p className="eta" style={{ '--level': lvl.color }}>
            {city.etaHours < 1 ? 'Now' : <>{Math.round(city.etaHours)}<small> h</small></>}
          </p>
          <h2 className="answer-line">{line}</h2>
          {city.peakWindow && (
            <p className="answer-sub">
              Heaviest between {clockAt(snapshot.t0, city.peakWindow.start)} and {clockAt(snapshot.t0, city.peakWindow.end)}. Plan outdoor activity around it.
            </p>
          )}
          <div className="advice">
            <h3 className="mini-head">What to do</h3>
            <ul>
              {adviceFor(city.level, when).map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
          <h3 className="mini-head">Where it comes from</h3>
          <div className="share-bar" aria-hidden="true">
            {city.sources.map((s, i) => (
              <span key={s.label} style={{ width: `${s.share}%`, opacity: 1 - i * 0.16 }} />
            ))}
          </div>
          <ul className="sources">
            {city.sources.map((s) => (
              <li key={s.label}>
                <span>{s.label.replace(/^near /, '')}{s.region ? `, ${s.region}` : ''}</span>
                <span className="num">{s.share}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pm25Chart aq={city.airQuality} t0={snapshot.t0} hour={hour} />
    </section>
  );
}
