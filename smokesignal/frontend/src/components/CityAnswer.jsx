import { LEVELS, clockAt, hoursText } from '../lib/format.js';

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
  return (
    <section className="answer" aria-live="polite">
      <label className="city-pick">
        <span className="visually-hidden">Choose a city</span>
        <select value={city.slug} onChange={(e) => onSelectCity(e.target.value)}>
          {snapshot.cities.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name} ({LEVELS[c.level].label.toLowerCase()})</option>
          ))}
        </select>
      </label>

      {clear ? (
        <>
          <p className="eta eta-clear">Clear</p>
          <h2 className="answer-line">No farm-fire smoke expected in {city.name} in the next 48 hours.</h2>
        </>
      ) : (
        <>
          <p className="eta" style={{ '--level': lvl.color }}>
            {city.etaHours < 1 ? 'Now' : <>{Math.round(city.etaHours)}<small> h</small></>}
          </p>
          <h2 className="answer-line">
            {lvl.word} smoke {city.etaHours < 1 ? `is reaching ${city.name} now` : `reaches ${city.name} in about ${hoursText(city.etaHours)}`}, around {clockAt(snapshot.t0, city.etaHours)}.
          </h2>
          {city.peakWindow && (
            <p className="answer-sub">
              Heaviest between {clockAt(snapshot.t0, city.peakWindow.start)} and {clockAt(snapshot.t0, city.peakWindow.end)}. Plan outdoor activity around it.
            </p>
          )}
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
