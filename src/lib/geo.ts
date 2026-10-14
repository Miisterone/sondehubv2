import { t, type TKey } from '@/i18n';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing in degrees (0–360). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Elevation angle (degrees) of a target seen from an observer, accounting for earth curvature. */
export function elevation(lat1: number, lon1: number, alt1: number, lat2: number, lon2: number, alt2: number): number {
  const d = distance(lat1, lon1, lat2, lon2);
  const theta = d / R;
  const r1 = R + alt1;
  const r2 = R + alt2;
  const x = r2 * Math.cos(theta) - r1;
  const y = r2 * Math.sin(theta);
  return deg(Math.atan2(x, y));
}

const COMPASS: TKey[] = [
  'lib.compass.n',
  'lib.compass.nne',
  'lib.compass.ne',
  'lib.compass.ene',
  'lib.compass.e',
  'lib.compass.ese',
  'lib.compass.se',
  'lib.compass.sse',
  'lib.compass.s',
  'lib.compass.ssw',
  'lib.compass.sw',
  'lib.compass.wsw',
  'lib.compass.w',
  'lib.compass.wnw',
  'lib.compass.nw',
  'lib.compass.nnw',
];
const compassIndex = (deg: number) => Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
export function compass(deg: number): string {
  return t(COMPASS[compassIndex(deg)]);
}

const COMPASS_WORD: TKey[] = [
  'lib.compassWord.n',
  'lib.compassWord.nne',
  'lib.compassWord.ne',
  'lib.compassWord.ene',
  'lib.compassWord.e',
  'lib.compassWord.ese',
  'lib.compassWord.se',
  'lib.compassWord.sse',
  'lib.compassWord.s',
  'lib.compassWord.ssw',
  'lib.compassWord.sw',
  'lib.compassWord.wsw',
  'lib.compassWord.w',
  'lib.compassWord.wnw',
  'lib.compassWord.nw',
  'lib.compassWord.nnw',
];

export function towards(deg: number): string {
  return t(COMPASS_WORD[compassIndex(deg)]);
}

const WIND8: TKey[] = ['lib.cardinal.n', 'lib.cardinal.ne', 'lib.cardinal.e', 'lib.cardinal.se', 'lib.cardinal.s', 'lib.cardinal.sw', 'lib.cardinal.w', 'lib.cardinal.nw'];

export function cardinal(deg: number): string {
  return t(WIND8[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);
}

export function parseLatLon(v: unknown): [number, number] | undefined {
  if (Array.isArray(v) && v.length >= 2) {
    const lat = Number(v[0]);
    const lon = Number(v[1]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : undefined;
  }
  if (typeof v === 'string') {
    const [a, b] = v.split(',').map(Number);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : undefined;
  }
  return undefined;
}
