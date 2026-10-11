// Simple equirectangular map of North India (no basemap, no external library).
export const VIEW = { west: 72.5, east: 81.5, south: 25.5, north: 33.0 };
const MID_LAT = (VIEW.north + VIEW.south) / 2;
export const ASPECT = ((VIEW.east - VIEW.west) * Math.cos((MID_LAT * Math.PI) / 180)) / (VIEW.north - VIEW.south);

export function project(lat, lon, w, h) {
  return [((lon - VIEW.west) / (VIEW.east - VIEW.west)) * w, ((VIEW.north - lat) / (VIEW.north - VIEW.south)) * h];
}

export function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Position of a trajectory at fractional hour h (null before release / after it ends). */
export function positionAt(traj, h) {
  const k = h - traj.r;
  if (k < 0) return null;
  const i = Math.floor(k);
  if (i >= traj.pts.length - 1) return k <= traj.pts.length - 1 ? traj.pts[traj.pts.length - 1] : null;
  const f = k - i;
  const [a, b] = [traj.pts[i], traj.pts[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Does this trajectory pass within radiusKm of the point? */
export function passesNear(traj, lat, lon, radiusKm) {
  return traj.pts.some((p) => km(p[0], p[1], lat, lon) <= radiusKm);
}

// Region names for orientation (approximate label positions, no borders drawn).
export const REGION_LABELS = [
  { name: 'Punjab', lat: 31.85, lon: 75.75 },
  { name: 'Haryana', lat: 29.35, lon: 76.15 },
  { name: 'Rajasthan', lat: 27.4, lon: 74.4 },
  { name: 'Uttar Pradesh', lat: 27.75, lon: 79.6 },
  { name: 'Uttarakhand', lat: 30.65, lon: 79.35 },
  { name: 'Himachal Pradesh', lat: 32.05, lon: 77.25 },
  { name: 'Pakistan', lat: 29.75, lon: 72.62, anchor: 'start' },
];

// Where each city's name goes, so the Delhi NCR labels don't collide.
export const CITY_LABELS = {
  delhi: 'above', gurugram: 'left', noida: 'right', lucknow: 'left', meerut: 'right', panipat: 'left',
};
