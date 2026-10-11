import { useEffect, useMemo, useRef, useState } from 'react';
import { ASPECT, CITY_LABELS, REGION_LABELS, VIEW, passesNear, positionAt, project } from '../lib/geo.js';
import { LEVELS } from '../lib/format.js';

const ARRIVAL_KM = 35;

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export default function SmokeMap({ snapshot, hour, city, onSelectCity, cluster }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const w = useWidth(wrap);
  const h = Math.round(w / ASPECT);
  const radius = snapshot.params?.arrivalKm ?? ARRIVAL_KM;

  // Which smoke paths to emphasise: those reaching the selected city, or from the highlighted cluster.
  const focus = useMemo(() => {
    if (cluster) return new Set(snapshot.trajectories.flatMap((t, i) => (cluster.ids.includes(t.c) ? [i] : [])));
    if (city && city.level !== 'none') {
      return new Set(snapshot.trajectories.flatMap((t, i) => (passesNear(t, city.lat, city.lon, radius) ? [i] : [])));
    }
    return null;
  }, [snapshot, city, cluster, radius]);

  const maxW = useMemo(() => Math.max(1, ...snapshot.trajectories.map((t) => t.w)), [snapshot]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !w) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const scale = w / 900;

    // Smoke: many faint paths build up into a brown haze where they overlap.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    snapshot.trajectories.forEach((t, i) => {
      if (hour < t.r) return;
      const strength = Math.sqrt(t.w / maxW);
      const on = !focus || focus.has(i);
      const alpha = focus ? (on ? 0.06 + 0.22 * strength : 0.012 + 0.03 * strength) : 0.025 + 0.1 * strength;
      const width = (1.2 + 5 * strength) * Math.max(scale, 0.6);
      const head = positionAt(t, hour);
      const last = Math.min(t.pts.length - 1, Math.floor(hour - t.r));
      ctx.beginPath();
      t.pts.slice(0, last + 1).forEach(([la, lo], k) => {
        const [x, y] = project(la, lo, w, h);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      if (head) ctx.lineTo(...project(head[0], head[1], w, h));
      ctx.strokeStyle = on && focus ? `rgba(84,60,38,${alpha})` : `rgba(112,94,76,${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
      if (head) {
        const [x, y] = project(head[0], head[1], w, h);
        ctx.beginPath();
        ctx.arc(x, y, width * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96,78,60,${alpha * 0.8})`;
        ctx.fill();
      }
    });

    // Fires seen by satellite in the last 24 h.
    ctx.globalCompositeOperation = 'source-over';
    for (const [la, lo, frp] of snapshot.fires) {
      const [x, y] = project(la, lo, w, h);
      const r = Math.min(4.5, 0.9 + Math.sqrt(frp) * 0.32) * Math.max(scale, 0.7);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(226,72,28,0.85)';
      ctx.fill();
    }
  }, [snapshot, hour, w, h, focus, maxW]);

  const grid = [];
  if (w) {
    for (let lon = Math.ceil(VIEW.west); lon <= VIEW.east; lon++) grid.push({ k: `lon${lon}`, x1: project(0, lon, w, h)[0], y1: 0, x2: project(0, lon, w, h)[0], y2: h, label: `${lon}°E`, lx: project(0, lon, w, h)[0] + 4, ly: h - 6 });
    for (let lat = Math.ceil(VIEW.south); lat <= VIEW.north; lat++) grid.push({ k: `lat${lat}`, x1: 0, y1: project(lat, 0, w, h)[1], x2: w, y2: project(lat, 0, w, h)[1], label: `${lat}°N`, lx: 6, ly: project(lat, 0, w, h)[1] - 4 });
  }
  const pxPerKm = h / ((VIEW.north - VIEW.south) * 111.32);

  return (
    <div className="map" ref={wrap} style={{ height: h || undefined }}>
      <canvas ref={canvas} className="map-canvas" style={{ width: w, height: h }} aria-hidden="true" />
      {w > 0 && (
        <svg className="map-svg" width={w} height={h} role="img" aria-label="Map of North India showing farm fires and forecast smoke paths">
          <g className="graticule">
            {grid.map((g) => (
              <g key={g.k}>
                <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
                <text x={g.lx} y={g.ly}>{g.label}</text>
              </g>
            ))}
          </g>
          <g className="regions">
            {REGION_LABELS.map((r) => {
              const [x, y] = project(r.lat, r.lon, w, h);
              return <text key={r.name} x={x} y={y} textAnchor={r.anchor || 'middle'}>{r.name}</text>;
            })}
          </g>
          {cluster && (() => {
            const [x, y] = project(cluster.lat, cluster.lon, w, h);
            return (
              <g className="cluster-mark">
                <circle className="halo" cx={x} cy={y} r={15} />
                <circle className="ring" cx={x} cy={y} r={15} />
                <text x={x + 21} y={y + 5}>{cluster.label.replace(/^near /, '')}</text>
              </g>
            );
          })()}
          {snapshot.cities.map((c) => {
            const [x, y] = project(c.lat, c.lon, w, h);
            const selected = city?.slug === c.slug;
            return (
              <g
                key={c.slug}
                className={`city${selected ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${c.name}: ${LEVELS[c.level].label} smoke`}
                aria-pressed={selected}
                onClick={() => onSelectCity(c.slug)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCity(c.slug); } }}
              >
                {selected && <circle className="reach" cx={x} cy={y} r={radius * pxPerKm} />}
                <circle className="hit" cx={x} cy={y} r={14} />
                <circle className="dot" cx={x} cy={y} r={selected ? 7 : 5} style={{ fill: LEVELS[c.level].color }} />
                {(() => {
                  const gap = selected ? 11 : 9;
                  let side = CITY_LABELS[c.slug] || 'right';
                  if (side === 'right' && x > w - 70) side = 'left';
                  const at = {
                    right: { x: x + gap, y: y + 4, anchor: 'start' },
                    left: { x: x - gap, y: y + 4, anchor: 'end' },
                    above: { x, y: y - gap - 2, anchor: 'middle' },
                  }[side];
                  return <text x={at.x} y={at.y} textAnchor={at.anchor}>{c.name}</text>;
                })()}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
