import { useMemo } from 'react';
import { nf, people } from '../lib/format.js';

/** Group fire clusters by area ("near Sangrur") and rank areas by people-weighted smoke delivered. */
export function rankAreas(clusters) {
  const areas = new Map();
  for (const c of clusters) {
    if (!c.peopleDownwind24h || !c.priority) continue; // only fires in India are ranked
    let a = areas.get(c.label);
    if (!a) {
      a = { id: c.label, label: c.label, region: c.region, ids: [], fires: 0, impact: 0, people: 0, cities: new Set(), lat: c.lat, lon: c.lon };
      areas.set(c.label, a);
    }
    a.ids.push(c.id);
    a.fires += c.count;
    a.impact += c.impact;
    a.people = Math.max(a.people, c.peopleDownwind24h);
    c.citiesReached24h.forEach((x) => a.cities.add(x));
  }
  return [...areas.values()]
    .sort((x, y) => y.impact - x.impact)
    .map((a, k) => ({ ...a, rank: k + 1, cities: [...a.cities] }));
}

export default function ActFirst({ clusters, selected, onSelect }) {
  const top = useMemo(() => rankAreas(clusters).slice(0, 6), [clusters]);
  return (
    <section className="act">
      <h2>Fires to act on first</h2>
      <p className="lede">Fires in India, ranked by how much smoke each area sends towards people in the next 24 hours. Select one to see its smoke on the map.</p>
      {top.length === 0 ? (
        <p className="empty">No fires send smoke to a tracked city in the next 24 hours.</p>
      ) : (
        <ol>
          {top.map((a) => {
            const on = selected?.id === a.id;
            return (
              <li key={a.id}>
                <button type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => onSelect(on ? null : a)}>
                  <span className="rank">{a.rank}</span>
                  <span className="act-body">
                    <strong>{a.label.replace(/^near /, 'Near ')}{a.region ? `, ${a.region}` : ''}</strong>
                    <span>
                      {nf.format(a.fires)} fire{a.fires === 1 ? '' : 's'}
                      {a.ids.length > 1 ? ` in ${a.ids.length} clusters` : ''}, smoke reaches {a.cities.join(', ')} within 24 h
                    </span>
                  </span>
                  <span className="act-people">{people(a.people)}</span>
                  <span className="act-coords">{a.lat.toFixed(2)}°N {a.lon.toFixed(2)}°E</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
