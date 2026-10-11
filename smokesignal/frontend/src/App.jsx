import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLatest } from './lib/api.js';
import { LEVELS, issuedAt, nf } from './lib/format.js';
import SmokeMap from './components/SmokeMap.jsx';
import TimeScrubber from './components/TimeScrubber.jsx';
import CityAnswer from './components/CityAnswer.jsx';
import ActFirst from './components/ActFirst.jsx';
import Bulletin from './components/Bulletin.jsx';
import Subscribe from './components/Subscribe.jsx';

const HOURS_PER_SECOND = 7;
const REFRESH_MS = 5 * 60 * 1000;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="9" cy="23" r="5" fill="var(--ember)" />
      <path d="M12 19c3-5 8-3 10-8s5-6 8-6" stroke="var(--smoke-2)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [citySlug, setCitySlug] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const hourRef = useRef(0);
  const stopAt = useRef(48);

  const fetchLatest = useCallback(async (first) => {
    try {
      const s = await loadLatest();
      setError('');
      setSnapshot((prev) => (prev?.runId === s.runId && prev?.generatedAt === s.generatedAt ? prev : s));
      if (first) {
        setCitySlug(s.cities[0]?.slug ?? null);
        if (reducedMotion()) {
          hourRef.current = 24;
          setHour(24);
        } else {
          stopAt.current = 24; // opening moment: play the next 24 hours of smoke once
          setPlaying(true);
        }
      }
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    fetchLatest(true);
    const id = setInterval(() => fetchLatest(false), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchLatest]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const next = Math.min(stopAt.current, hourRef.current + ((now - last) / 1000) * HOURS_PER_SECOND);
      last = now;
      hourRef.current = next;
      setHour(next);
      if (next >= stopAt.current) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const onHour = (h) => {
    setPlaying(false);
    hourRef.current = h;
    setHour(h);
  };

  const onTogglePlay = () => {
    if (playing) { setPlaying(false); return; }
    stopAt.current = snapshot?.hours ?? 48;
    if (hourRef.current >= stopAt.current) { hourRef.current = 0; setHour(0); }
    setPlaying(true);
  };

  const onSelectCity = (slug) => { setCitySlug(slug); setCluster(null); };

  if (error && !snapshot) {
    return (
      <main className="state">
        <p>{error}</p>
        <button type="button" className="btn" onClick={() => fetchLatest(true)}>Try again</button>
      </main>
    );
  }
  if (!snapshot) return <main className="state"><p>Loading the latest smoke forecast</p></main>;

  const city = snapshot.cities.find((c) => c.slug === citySlug) ?? snapshot.cities[0];

  return (
    <div className="page">
      {snapshot.mock && <div className="mock-banner" role="note">Sample data for development. This is not a real forecast.</div>}

      <header className="top">
        <div className="brand"><Mark /><span>SmokeSignal</span></div>
        <p className="tagline">When farm-fire smoke will reach your city, and which fires it is coming from.</p>
        <p className="issued">
          Forecast issued {issuedAt(snapshot.generatedAt)} IST from {nf.format(snapshot.fireStats.count)} satellite fire detections in the last 24 hours.
          {error && <span className="stale"> Showing the last forecast: {error}</span>}
        </p>
      </header>

      <main className="layout">
        <div className="map-col">
          <SmokeMap snapshot={snapshot} hour={hour} city={city} cluster={cluster} onSelectCity={onSelectCity} />
          <TimeScrubber t0={snapshot.t0} hours={snapshot.hours} hour={hour} playing={playing} onHour={onHour} onTogglePlay={onTogglePlay} />
          <ul className="legend">
            <li><span className="key key-fire" />Fire seen by satellite, last 24 h</li>
            <li><span className="key key-smoke" />Forecast smoke path</li>
            {['none', 'low', 'moderate', 'high'].map((l) => (
              <li key={l}><span className="key key-city" style={{ background: LEVELS[l].color }} />{LEVELS[l].label}</li>
            ))}
          </ul>
        </div>
        <div className="answer-col">
          <CityAnswer snapshot={snapshot} city={city} onSelectCity={onSelectCity} hour={hour} />
        </div>
        <div className="sub-col">
          <Subscribe city={city} />
        </div>
      </main>

      <div className="lower">
        <ActFirst clusters={snapshot.clusters} selected={cluster} onSelect={setCluster} />
        <Bulletin bulletin={snapshot.bulletin} />
      </div>

      <footer className="foot">
        <details>
          <summary>How this forecast works</summary>
          <ol>
            <li>Every 3 hours, NASA FIRMS fire detections from the VIIRS satellites over Punjab, Haryana and nearby areas are grouped into clusters of about {snapshot.params.clusterKm} km, weighted by fire radiative power.</li>
            <li>Smoke from each cluster is released now and over the next 6 hours, then moved with the 48-hour wind forecast at {snapshot.windLevel}, roughly where the smoke travels.</li>
            <li>Smoke weakens as it travels (half-life about {Math.round(snapshot.params.decayHours * Math.LN2)} hours). Smoke passing within {snapshot.params.arrivalKm} km of a city counts as arriving there.</li>
            <li>Amazon Bedrock writes the bulletin from these numbers. Alerts go out through Amazon SNS.</li>
          </ol>
          <p>This estimates when and from where smoke arrives. It is not a pollution measurement; the CAMS PM2.5 forecast is shown as an independent check. Data: NASA FIRMS, Open-Meteo, CAMS.</p>
        </details>
      </footer>
    </div>
  );
}
