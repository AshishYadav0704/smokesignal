import { clockAt } from '../lib/format.js';

export default function TimeScrubber({ t0, hours, hour, playing, onHour, onTogglePlay }) {
  const h = Math.round(hour);
  return (
    <div className="scrubber">
      <button type="button" className="play" onClick={onTogglePlay} aria-label={playing ? 'Pause smoke animation' : 'Play smoke animation'}>
        {playing ? (
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="4" height="14" rx="1" /><rect x="12" y="3" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3l12 7-12 7z" /></svg>
        )}
      </button>
      <div className="scrub-track">
        <label className="scrub-now" htmlFor="hour">
          <strong>{clockAt(t0, hour)}</strong>
          <span>{h === 0 ? 'now' : `in ${h} h`}</span>
        </label>
        <input
          id="hour"
          type="range"
          min="0"
          max={hours}
          step="0.25"
          value={hour}
          onChange={(e) => onHour(Number(e.target.value))}
        />
        <div className="scrub-ticks" aria-hidden="true">
          <span>Now</span>
          <span>+12 h</span>
          <span>+24 h</span>
          <span>+36 h</span>
          <span>+48 h</span>
        </div>
      </div>
    </div>
  );
}
