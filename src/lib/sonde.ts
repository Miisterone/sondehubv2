import type { FlightPhase, LaunchSite, ReversePrediction, Sonde } from './types';
import { bearing, distance } from './geo';
import { getLocale, intlTag, t, type TKey } from '@/i18n';

export interface Launch {
  t: number;
  site: string | null;
  siteId: string | null;
  fromGround: boolean;
  estimated: boolean;
  near: { site: string; siteId: string; d: number; bearing: number } | null;
  point: { lat: number; lon: number } | null;
}

const SITE_RADIUS_M = 30_000;
const NEAR_RADIUS_M = 300_000;

function nearest(sites: LaunchSite[], lat: number, lon: number): { site: LaunchSite; d: number } | null {
  let best: { site: LaunchSite; d: number } | null = null;
  for (const s of sites) {
    const d = distance(lat, lon, s.lat, s.lon);
    if (!best || d < best.d) best = { site: s, d };
  }
  return best;
}

export function findLaunch(sonde: Pick<Sonde, 'track'>, sites: LaunchSite[], reverse?: ReversePrediction): Launch | null {
  if (!sonde.track.length) return null;
  const [lon, lat, alt, t] = sonde.track[0];
  const fromGround = alt < 3000;
  const assigned = reverse?.site ? (sites.find((s) => s.id === reverse.site) ?? null) : null;
  if (fromGround) {
    const close = nearest(sites, lat, lon);
    const site = assigned ?? (close && close.d < SITE_RADIUS_M ? close.site : null);
    return { t, site: site?.name ?? null, siteId: site?.id ?? null, fromGround, estimated: false, near: null, point: { lat, lon } };
  }
  if (reverse) {
    let near: Launch['near'] = null;
    if (!assigned) {
      const close = nearest(sites, reverse.lat, reverse.lon);
      if (close && close.d < NEAR_RADIUS_M) {
        near = { site: close.site.name, siteId: close.site.id, d: close.d, bearing: bearing(close.site.lat, close.site.lon, reverse.lat, reverse.lon) };
      }
    }
    return {
      t: reverse.launchTime,
      site: assigned?.name ?? null,
      siteId: assigned?.id ?? null,
      fromGround,
      estimated: true,
      near,
      point: { lat: reverse.lat, lon: reverse.lon },
    };
  }
  return { t, site: null, siteId: null, fromGround, estimated: false, near: null, point: null };
}

export function siteLabel(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

const COUNTRIES: Record<string, TKey> = {
  France: 'lib.country.france',
  Switzerland: 'lib.country.switzerland',
  Germany: 'lib.country.germany',
  Italy: 'lib.country.italy',
  Spain: 'lib.country.spain',
  Portugal: 'lib.country.portugal',
  Belgium: 'lib.country.belgium',
  Netherlands: 'lib.country.netherlands',
  Luxembourg: 'lib.country.luxembourg',
  Austria: 'lib.country.austria',
  'United Kingdom': 'lib.country.unitedKingdom',
  Ireland: 'lib.country.ireland',
  Denmark: 'lib.country.denmark',
  Norway: 'lib.country.norway',
  Sweden: 'lib.country.sweden',
  Finland: 'lib.country.finland',
  Poland: 'lib.country.poland',
  'Czech Republic': 'lib.country.czechia',
  Czechia: 'lib.country.czechia',
  Hungary: 'lib.country.hungary',
  Greece: 'lib.country.greece',
  Croatia: 'lib.country.croatia',
  Slovenia: 'lib.country.slovenia',
  Slovakia: 'lib.country.slovakia',
  Romania: 'lib.country.romania',
  Bulgaria: 'lib.country.bulgaria',
  Serbia: 'lib.country.serbia',
  Morocco: 'lib.country.morocco',
  Algeria: 'lib.country.algeria',
  Tunisia: 'lib.country.tunisia',
  'United States': 'lib.country.unitedStates',
  USA: 'lib.country.unitedStates',
  Canada: 'lib.country.canada',
  Australia: 'lib.country.australia',
  'New Zealand': 'lib.country.newZealand',
  Japan: 'lib.country.japan',
  'French Guyana': 'lib.country.frenchGuiana',
  'French Polynesia': 'lib.country.frenchPolynesia',
};

export function siteCountry(name: string): string | null {
  const raw = name.match(/\(([^)]+)\)\s*$/)?.[1];
  if (!raw) return null;
  const key = COUNTRIES[raw];
  return key ? t(key) : raw;
}

export function verticalSpeed(s: Pick<Sonde, 'last' | 'lastTime' | 'track'>): number | undefined {
  const v = s.last.vel_v;
  if (v !== undefined && Number.isFinite(v)) return v;
  const tr = s.track;
  for (let i = tr.length - 1; i >= 0; i--) {
    const dt = (s.lastTime - tr[i][3]) / 1000;
    if (dt > 120) break;
    if (dt >= 20 || i === 0) return dt >= 5 ? (s.last.alt - tr[i][2]) / dt : undefined;
  }
  return undefined;
}

const GLIDER_BATT_V = 3.3;
const GLIDER_BATT_TOLERANCE_V = 0.2;

export function isGlider(s: { type?: string; subtype?: string; last: { batt?: number } }): boolean {
  const batt = s.last.batt;
  const m20 = [s.subtype, s.type].some((v) => v?.toUpperCase().startsWith('M20'));
  return m20 && typeof batt === 'number' && Math.abs(batt - GLIDER_BATT_V) <= GLIDER_BATT_TOLERANCE_V;
}

const FLIGHT_GAP_MS = 12 * 3_600_000;
const FLIGHT_MIN_ALT = 5000;

export function pickFlight<T extends { datetime: string; alt: number }>(frames: T[], near?: number): T[] {
  const time = (f: T) => Date.parse(f.datetime);
  const groups: T[][] = [];
  let current: T[] = [];
  for (const f of frames) {
    if (current.length && time(f) - time(current[current.length - 1]) > FLIGHT_GAP_MS) {
      groups.push(current);
      current = [];
    }
    current.push(f);
  }
  if (current.length) groups.push(current);
  const flights: T[][] = [];
  for (const g of groups) {
    const flew = g.some((f) => f.alt >= FLIGHT_MIN_ALT);
    if (!flew && flights.length) flights[flights.length - 1].push(...g);
    else flights.push(g);
  }
  if (flights.length < 2) return frames;
  if (near === undefined) return flights[flights.length - 1];
  const off = (g: T[]) => Math.max(0, time(g[0]) - near, near - time(g[g.length - 1]));
  return flights.reduce((best, g) => (off(g) < off(best) ? g : best));
}

export function sameFlight(s: Pick<Sonde, 'track' | 'lastTime'>, start: number, end: number): boolean {
  if (!s.track.length) return true;
  return start - s.lastTime <= FLIGHT_GAP_MS && s.track[0][3] - end <= FLIGHT_GAP_MS;
}

export function replayPhase(tMs: number, burstMs: number | null, endMs: number, phase: FlightPhase): FlightPhase {
  if (tMs >= endMs && (phase === 'landed' || phase === 'lost')) return phase;
  return burstMs !== null && tMs > burstMs ? 'descending' : 'ascending';
}

const RS_TYPES: Record<string, string> = {
  '11': 'LMS6-403',
  '17': 'DFM-09',
  '19': 'MKII',
  '23': 'Vaisala RS41',
  '41': 'Vaisala RS41',
  '52': 'Vaisala RS92-NGP',
  '61': 'LMS6-1680',
  '63': 'M20',
  '77': 'M10',
  '80': 'Vaisala RS92-SGP',
  '82': 'LMS6-1680',
  '96': 'MRZ',
};

export function sondeTypeName(code: string): string {
  return RS_TYPES[code] ?? t('lib.sonde.typeCode', { code });
}

const LAUNCH_LEAD_MS = 45 * 60_000;
const WEEKDAYS: TKey[] = [
  'lib.schedule.sunday',
  'lib.schedule.monday',
  'lib.schedule.tuesday',
  'lib.schedule.wednesday',
  'lib.schedule.thursday',
  'lib.schedule.friday',
  'lib.schedule.saturday',
];

interface Slot {
  day: number;
  hour: number;
  minute: number;
}

function parseSlot(t: string): Slot | null {
  const [day, hour, minute] = t.split(':').map(Number);
  if (![day, hour, minute].every(Number.isInteger)) return null;
  return day >= 0 && day <= 7 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { day, hour, minute } : null;
}

export function upcomingLaunches(times: string[], now: number, horizonMs = 168 * 3_600_000, max = 14): number[] {
  const out = new Set<number>();
  for (const slot of times.map(parseSlot)) {
    if (!slot) continue;
    for (let k = -1; k <= 8; k++) {
      const d = new Date(now);
      d.setUTCHours(slot.hour, slot.minute, 0, 0);
      d.setUTCDate(d.getUTCDate() + k);
      if (slot.day !== 0 && (d.getUTCDay() === 0 ? 7 : d.getUTCDay()) !== slot.day) continue;
      const launch = d.getTime() - LAUNCH_LEAD_MS;
      if (launch > now && launch - now <= horizonMs) out.add(launch);
    }
  }
  return [...out].sort((a, b) => a - b).slice(0, max);
}

export function fmtHour(ts: number): string {
  const d = new Date(ts);
  if (getLocale() !== 'fr') return d.toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });
  return t('lib.time.hourMinute', { h: d.getHours(), m: String(d.getMinutes()).padStart(2, '0') });
}

export function fmtDay(ts: number, now: number): string {
  const d = new Date(ts);
  const today = new Date(now);
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return t('lib.time.today');
  if (dayDiff === 1) return t('lib.time.tomorrow');
  if (dayDiff === -1) return t('lib.time.yesterday');
  const s = d.toLocaleDateString(intlTag(), { weekday: 'long', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinFr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : new Intl.ListFormat(intlTag(), { style: 'long', type: 'conjunction' }).format(items);
}

export function scheduleText(times: string[], now: number): string | null {
  const slots = times.map(parseSlot).filter((s): s is Slot => s !== null);
  if (!slots.length) return null;
  const local = (s: Slot) => {
    const d = new Date(now);
    d.setUTCHours(s.hour, s.minute, 0, 0);
    return d.getTime() - LAUNCH_LEAD_MS;
  };
  const byHour = (a: Slot, b: Slot) => new Date(local(a)).getHours() * 60 + new Date(local(a)).getMinutes() - (new Date(local(b)).getHours() * 60 + new Date(local(b)).getMinutes());
  const daily = slots.filter((s) => s.day === 0).sort(byHour);
  const weekly = slots.filter((s) => s.day !== 0);
  const parts: string[] = [];
  if (daily.length) parts.push(t('lib.schedule.daily', { hours: joinFr(daily.map((s) => fmtHour(local(s)))) }));
  const days = [...new Set(weekly.map((s) => s.day))].sort((a, b) => a - b);
  for (const day of days) {
    const hours = weekly.filter((s) => s.day === day).sort(byHour);
    parts.push(t(WEEKDAYS[day % 7], { hours: joinFr(hours.map((s) => fmtHour(local(s)))) }));
  }
  return joinFr(parts);
}
