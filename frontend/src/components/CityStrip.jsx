import { LEVELS } from '../lib/format.js';

function etaShort(c) {
  if (c.level === 'none' || c.etaHours == null) return 'clear';
  return c.etaHours < 1 ? 'now' : `${Math.round(c.etaHours)} h`;
}

/** Every tracked city at a glance, worst first. Selecting one shows its answer. */
export default function CityStrip({ cities, selected, onSelect }) {
  const hit = cities.filter((c) => c.level === 'moderate' || c.level === 'high').length;
  return (
    <section className="strip" aria-label="All cities">
      <div className="strip-head">
        <h2 className="mini-head">All {cities.length} cities</h2>
        <p className="strip-count">
          {hit ? `${hit} expect moderate or heavy smoke in the next 48 h` : 'None expect moderate or heavy smoke in the next 48 h'}
        </p>
      </div>
      <ul>
        {cities.map((c) => (
          <li key={c.slug}>
            <button
              type="button"
              className={c.slug === selected ? 'is-on' : ''}
              aria-pressed={c.slug === selected}
              onClick={() => onSelect(c.slug)}
            >
              <span className="key key-city" style={{ background: LEVELS[c.level].color }} />
              <span className="strip-name">{c.name}</span>
              <span className="strip-eta">{etaShort(c)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
