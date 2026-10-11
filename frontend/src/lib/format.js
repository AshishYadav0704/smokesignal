export const LEVELS = {
  none: { word: 'No', label: 'Clear', color: 'var(--smoke-0)' },
  low: { word: 'Light', label: 'Light', color: 'var(--smoke-1)' },
  moderate: { word: 'Moderate', label: 'Moderate', color: 'var(--smoke-2)' },
  high: { word: 'Heavy', label: 'Heavy', color: 'var(--smoke-3)' },
};

const IST = 'Asia/Kolkata';

/** "Sat 21:00" for t0 + h hours. */
export function clockAt(t0, h) {
  const d = new Date((t0 + h * 3600) * 1000);
  const day = d.toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short' });
  const time = d.toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${time}`;
}

export function issuedAt(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: IST, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function hoursText(h) {
  if (h == null) return '';
  if (h < 1) return 'under an hour';
  const r = Math.round(h);
  return `${r} hour${r === 1 ? '' : 's'}`;
}

export function people(n) {
  if (!n) return 'no tracked cities';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million people`;
  return `${Math.round(n / 1000)} thousand people`;
}

export const nf = new Intl.NumberFormat('en-IN');
