// Geography used by SmokeSignal.
// All coordinates are approximate and used only for (a) choosing where to look for
// fires and winds and (b) giving fire clusters a human-readable "near X" label.

// Where we look for crop-residue fires (west, south, east, north).
// Covers Indian Punjab, Haryana, west UP, north Rajasthan and the Pakistani Punjab
// border belt, because smoke does not stop at borders.
export const FIRE_BBOX = { west: 73.2, south: 28.5, east: 77.8, north: 32.6 };

// Wind grid: must cover the fire region plus everything downwind we report on.
export const WIND_BBOX = { west: 72.5, south: 25.5, east: 81.5, north: 33.0 };
export const WIND_STEP_DEG = 0.5;

// Cities we forecast smoke arrival for.
// pop = Census 2011 city / urban-area population, rounded (used to rank which fires affect the most people).
export const CITIES = [
  { slug: 'delhi', name: 'Delhi', hi: 'दिल्ली', lat: 28.6139, lon: 77.209, pop: 16_800_000 },
  { slug: 'gurugram', name: 'Gurugram', hi: 'गुरुग्राम', lat: 28.4595, lon: 77.0266, pop: 880_000 },
  { slug: 'noida', name: 'Noida', hi: 'नोएडा', lat: 28.5355, lon: 77.391, pop: 640_000 },
  { slug: 'chandigarh', name: 'Chandigarh', hi: 'चंडीगढ़', lat: 30.7333, lon: 76.7794, pop: 1_060_000 },
  { slug: 'ludhiana', name: 'Ludhiana', hi: 'लुधियाना', lat: 30.901, lon: 75.8573, pop: 1_620_000 },
  { slug: 'dehradun', name: 'Dehradun', hi: 'देहरादून', lat: 30.3165, lon: 78.0322, pop: 580_000 },
  { slug: 'jaipur', name: 'Jaipur', hi: 'जयपुर', lat: 26.9124, lon: 75.7873, pop: 3_050_000 },
  { slug: 'agra', name: 'Agra', hi: 'आगरा', lat: 27.1767, lon: 78.0081, pop: 1_590_000 },
  { slug: 'kanpur', name: 'Kanpur', hi: 'कानपुर', lat: 26.4499, lon: 80.3319, pop: 2_770_000 },
  { slug: 'lucknow', name: 'Lucknow', hi: 'लखनऊ', lat: 26.8467, lon: 80.9462, pop: 2_820_000 },
];

// District headquarters used to label fire clusters ("near Sangrur").
export const PLACES = [
  // Punjab (India)
  ['Amritsar', 'Punjab', 31.634, 74.872], ['Tarn Taran', 'Punjab', 31.451, 74.928],
  ['Gurdaspur', 'Punjab', 32.041, 75.405], ['Pathankot', 'Punjab', 32.274, 75.652],
  ['Hoshiarpur', 'Punjab', 31.532, 75.912], ['Jalandhar', 'Punjab', 31.326, 75.576],
  ['Kapurthala', 'Punjab', 31.38, 75.381], ['Nawanshahr', 'Punjab', 31.125, 76.116],
  ['Rupnagar', 'Punjab', 30.966, 76.533], ['Mohali', 'Punjab', 30.704, 76.717],
  ['Fatehgarh Sahib', 'Punjab', 30.649, 76.392], ['Ludhiana', 'Punjab', 30.901, 75.857],
  ['Moga', 'Punjab', 30.817, 75.174], ['Ferozepur', 'Punjab', 30.925, 74.613],
  ['Fazilka', 'Punjab', 30.403, 74.028], ['Muktsar', 'Punjab', 30.474, 74.516],
  ['Faridkot', 'Punjab', 30.676, 74.758], ['Bathinda', 'Punjab', 30.211, 74.945],
  ['Mansa', 'Punjab', 29.998, 75.393], ['Barnala', 'Punjab', 30.378, 75.546],
  ['Sangrur', 'Punjab', 30.245, 75.844], ['Malerkotla', 'Punjab', 30.531, 75.879],
  ['Patiala', 'Punjab', 30.34, 76.386],
  // Haryana
  ['Sirsa', 'Haryana', 29.534, 75.029], ['Fatehabad', 'Haryana', 29.515, 75.455],
  ['Hisar', 'Haryana', 29.149, 75.722], ['Jind', 'Haryana', 29.316, 76.316],
  ['Kaithal', 'Haryana', 29.801, 76.4], ['Kurukshetra', 'Haryana', 29.969, 76.878],
  ['Karnal', 'Haryana', 29.686, 76.99], ['Panipat', 'Haryana', 29.391, 76.963],
  ['Sonipat', 'Haryana', 28.994, 77.019], ['Yamunanagar', 'Haryana', 30.129, 77.268],
  ['Ambala', 'Haryana', 30.378, 76.776], ['Rohtak', 'Haryana', 28.895, 76.607],
  ['Bhiwani', 'Haryana', 28.799, 76.134], ['Jhajjar', 'Haryana', 28.607, 76.657],
  // Uttar Pradesh (west)
  ['Saharanpur', 'Uttar Pradesh', 29.968, 77.546], ['Muzaffarnagar', 'Uttar Pradesh', 29.473, 77.708],
  ['Shamli', 'Uttar Pradesh', 29.45, 77.31], ['Meerut', 'Uttar Pradesh', 28.984, 77.706],
  ['Baghpat', 'Uttar Pradesh', 28.945, 77.218],
  // Rajasthan (north)
  ['Sri Ganganagar', 'Rajasthan', 29.904, 73.877], ['Hanumangarh', 'Rajasthan', 29.582, 74.329],
  // Punjab (Pakistan) — transboundary smoke
  ['Lahore', 'Pakistan', 31.55, 74.34], ['Kasur', 'Pakistan', 31.12, 74.45],
  ['Sheikhupura', 'Pakistan', 31.71, 73.98], ['Gujranwala', 'Pakistan', 32.16, 74.19],
  ['Sialkot', 'Pakistan', 32.49, 74.53], ['Okara', 'Pakistan', 30.81, 73.45],
  ['Pakpattan', 'Pakistan', 30.34, 73.39], ['Bahawalnagar', 'Pakistan', 29.99, 73.25],
].map(([name, region, lat, lon]) => ({ name, region, lat, lon }));

export const citiesBySlug = Object.fromEntries(CITIES.map((c) => [c.slug, c]));
