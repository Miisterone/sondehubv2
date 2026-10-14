import type { LaunchSite, ReversePrediction, Sonde } from './types';
import { bearing, distance } from './geo';

export interface Launch {
  t: number;
  site: string | null;
  siteId: string | null;
  fromGround: boolean;
  estimated: boolean;
  near: { site: string; siteId: string; d: number; bearing: number } | null;
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
    return { t, site: site?.name ?? null, siteId: site?.id ?? null, fromGround, estimated: false, near: null };
  }
  if (reverse) {
    let near: Launch['near'] = null;
    if (!assigned) {
      const close = nearest(sites, reverse.lat, reverse.lon);
      if (close && close.d < NEAR_RADIUS_M) {
        near = { site: close.site.name, siteId: close.site.id, d: close.d, bearing: bearing(close.site.lat, close.site.lon, reverse.lat, reverse.lon) };
      }
    }
    return { t: reverse.launchTime, site: assigned?.name ?? null, siteId: assigned?.id ?? null, fromGround, estimated: true, near };
  }
  return { t, site: null, siteId: null, fromGround, estimated: false, near: null };
}

export function siteLabel(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

const COUNTRIES: Record<string, string> = {
  France: 'France',
  Switzerland: 'Suisse',
  Germany: 'Allemagne',
  Italy: 'Italie',
  Spain: 'Espagne',
  Portugal: 'Portugal',
  Belgium: 'Belgique',
  Netherlands: 'Pays-Bas',
  Luxembourg: 'Luxembourg',
  Austria: 'Autriche',
  'United Kingdom': 'Royaume-Uni',
  Ireland: 'Irlande',
  Denmark: 'Danemark',
  Norway: 'Norvège',
  Sweden: 'Suède',
  Finland: 'Finlande',
  Poland: 'Pologne',
  'Czech Republic': 'Tchéquie',
  Czechia: 'Tchéquie',
  Hungary: 'Hongrie',
  Greece: 'Grèce',
  Croatia: 'Croatie',
  Slovenia: 'Slovénie',
  Slovakia: 'Slovaquie',
  Romania: 'Roumanie',
  Bulgaria: 'Bulgarie',
  Serbia: 'Serbie',
  Morocco: 'Maroc',
  Algeria: 'Algérie',
  Tunisia: 'Tunisie',
  'United States': 'États-Unis',
  USA: 'États-Unis',
  Canada: 'Canada',
  Australia: 'Australie',
  'New Zealand': 'Nouvelle-Zélande',
  Japan: 'Japon',
  'French Guyana': 'Guyane',
  'French Polynesia': 'Polynésie française',
};

export function siteCountry(name: string): string | null {
  const raw = name.match(/\(([^)]+)\)\s*$/)?.[1];
  return raw ? (COUNTRIES[raw] ?? raw) : null;
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
  return RS_TYPES[code] ?? `type ${code}`;
}

const LAUNCH_LEAD_MS = 45 * 60_000;
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

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
  return `${d.getHours()}\u00a0h\u00a0${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDay(ts: number, now: number): string {
  const d = new Date(ts);
  const today = new Date(now);
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return 'Aujourd’hui';
  if (dayDiff === 1) return 'Demain';
  if (dayDiff === -1) return 'Hier';
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinFr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
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
  if (daily.length) parts.push(`tous les jours vers ${joinFr(daily.map((s) => fmtHour(local(s))))}`);
  const days = [...new Set(weekly.map((s) => s.day))].sort((a, b) => a - b);
  for (const day of days) {
    const hours = weekly.filter((s) => s.day === day).sort(byHour);
    parts.push(`le ${WEEKDAYS[day % 7]} vers ${joinFr(hours.map((s) => fmtHour(local(s))))}`);
  }
  return joinFr(parts);
}
