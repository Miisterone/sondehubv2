/**
 * Best-guess starting view from the browser time zone — no permission prompt needed,
 * so a first-time visitor lands on their own region instead of a fixed place.
 */
export interface View {
  center: [number, number]; // lon, lat
  zoom: number;
}

const ZONES: Record<string, View> = {
  'Europe/Paris': { center: [2.4, 46.6], zoom: 5.2 },
  'Europe/Brussels': { center: [4.5, 50.6], zoom: 6.3 },
  'Europe/Luxembourg': { center: [6.1, 49.8], zoom: 6.5 },
  'Europe/Zurich': { center: [8.2, 46.8], zoom: 6.4 },
  'Europe/Berlin': { center: [10.4, 51.1], zoom: 5.3 },
  'Europe/Vienna': { center: [14.5, 47.6], zoom: 6 },
  'Europe/Amsterdam': { center: [5.3, 52.2], zoom: 6.4 },
  'Europe/London': { center: [-2.5, 54], zoom: 5 },
  'Europe/Dublin': { center: [-8, 53.4], zoom: 6 },
  'Europe/Madrid': { center: [-3.7, 40.2], zoom: 5.2 },
  'Europe/Lisbon': { center: [-8.2, 39.6], zoom: 5.8 },
  'Europe/Rome': { center: [12.5, 42.5], zoom: 5.2 },
  'Europe/Warsaw': { center: [19.4, 52], zoom: 5.6 },
  'Europe/Prague': { center: [15.4, 49.8], zoom: 6.2 },
  'Europe/Budapest': { center: [19.4, 47.2], zoom: 6.2 },
  'Europe/Stockholm': { center: [16, 62], zoom: 4.3 },
  'Europe/Oslo': { center: [10, 62], zoom: 4.3 },
  'Europe/Helsinki': { center: [26, 63], zoom: 4.5 },
  'Europe/Copenhagen': { center: [10, 56], zoom: 6 },
  'America/New_York': { center: [-77, 40.5], zoom: 4.8 },
  'America/Toronto': { center: [-79.5, 44.5], zoom: 5 },
  'America/Chicago': { center: [-91, 39], zoom: 4.6 },
  'America/Denver': { center: [-106, 40], zoom: 4.8 },
  'America/Phoenix': { center: [-112, 34], zoom: 5.5 },
  'America/Los_Angeles': { center: [-119.5, 37], zoom: 5 },
  'America/Vancouver': { center: [-123, 50], zoom: 5 },
  'America/Anchorage': { center: [-150, 62], zoom: 4 },
  'America/Sao_Paulo': { center: [-47, -20], zoom: 4.2 },
  'America/Argentina/Buenos_Aires': { center: [-62, -36], zoom: 4.2 },
  'Australia/Sydney': { center: [149, -33], zoom: 5 },
  'Australia/Melbourne': { center: [144.9, -37.5], zoom: 5.5 },
  'Australia/Brisbane': { center: [151, -26], zoom: 5 },
  'Australia/Perth': { center: [116, -31.5], zoom: 5 },
  'Australia/Adelaide': { center: [138.6, -34.5], zoom: 5.5 },
  'Pacific/Auckland': { center: [173.5, -41], zoom: 4.8 },
  'Asia/Tokyo': { center: [138, 37], zoom: 4.6 },
  'Asia/Seoul': { center: [127.8, 36.3], zoom: 6 },
  'Asia/Taipei': { center: [121, 23.7], zoom: 6.3 },
  'Asia/Hong_Kong': { center: [114.2, 22.4], zoom: 7 },
  'Asia/Singapore': { center: [103.8, 1.35], zoom: 7 },
  'Asia/Kolkata': { center: [79, 22], zoom: 4.2 },
};

const CONTINENTS: Record<string, View> = {
  Europe: { center: [10, 50], zoom: 4.2 },
  America: { center: [-96, 40], zoom: 3.5 },
  Australia: { center: [134, -27], zoom: 3.7 },
  Pacific: { center: [172, -30], zoom: 3.5 },
  Asia: { center: [105, 33], zoom: 3.2 },
  Africa: { center: [20, 2], zoom: 3.2 },
  Atlantic: { center: [-30, 45], zoom: 3 },
  Indian: { center: [70, -15], zoom: 3 },
  Antarctica: { center: [0, -75], zoom: 2.5 },
};

export const DEFAULT_VIEW: View = { center: [6, 47], zoom: 4.2 };

export function viewForTimeZone(tz?: string): View {
  try {
    tz ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return DEFAULT_VIEW;
  }
  if (!tz) return DEFAULT_VIEW;
  return ZONES[tz] ?? CONTINENTS[tz.split('/')[0]] ?? DEFAULT_VIEW;
}

/** Closed polygon ring approximating a geodesic circle (for radius overlays). */
export function circleRing(lon: number, lat: number, radiusM: number, steps = 96): [number, number][] {
  const R = 6371008.8;
  const d = radiusM / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const θ = (i / steps) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([(((λ2 * 180) / Math.PI + 540) % 360) - 180, (φ2 * 180) / Math.PI]);
  }
  return ring;
}
