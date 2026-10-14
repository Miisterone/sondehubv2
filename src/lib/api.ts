import type { FlightPoint, Frame, LaunchSite, Listener, PastFlight, Prediction, PredictionPoint, Recovery, ReversePrediction, SiteForecast } from './types';
import { decodeEntities } from './text';
import { t } from '@/i18n';

const API = 'https://api.v2.sondehub.org';

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal });
  if (!res.ok) throw new Error(t('lib.api.httpError', { status: res.status, path }));
  return res.json() as Promise<T>;
}

/** Telemetry keyed by serial, then by datetime. The API decimates long periods. */
export type TelemetryResponse = Record<string, Record<string, Frame>>;

export function fetchTelemetry(duration: string, signal?: AbortSignal) {
  return getJSON<TelemetryResponse>(`/sondes/telemetry?duration=${duration}`, signal);
}

/** Full-resolution history for one sonde (used when it is selected). */
export function fetchSondeHistory(serial: string, signal?: AbortSignal) {
  return getJSON<TelemetryResponse>(`/sondes/telemetry?serial=${encodeURIComponent(serial)}`, signal);
}

interface RawPrediction {
  vehicle: string;
  time: string;
  ascent_rate: number;
  descent_rate: number;
  burst_altitude: number;
  descending: number | boolean;
  landed: number | boolean;
  data: string | PredictionPoint[];
}

/** Websocket predictions have a slightly different shape than the REST ones. */
export interface RawWsPrediction {
  serial: string;
  datetime: string;
  ascent_rate: number;
  descent_rate: number;
  burst_altitude: number;
  descending: boolean;
  landed: boolean;
  data: PredictionPoint[];
}

export function normalisePrediction(raw: RawPrediction | RawWsPrediction): Prediction | null {
  const serial = 'vehicle' in raw ? raw.vehicle : raw.serial;
  const timeStr = 'vehicle' in raw ? raw.time : raw.datetime;
  let path: PredictionPoint[];
  try {
    path = typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
  } catch {
    return null;
  }
  if (!serial || !Array.isArray(path) || path.length === 0) return null;
  const descending = Boolean(raw.descending);
  let burst: PredictionPoint | null = null;
  if (!descending) {
    for (const p of path) if (!burst || p.alt > burst.alt) burst = p;
  }
  return {
    serial,
    time: Date.parse(timeStr),
    ascentRate: raw.ascent_rate,
    descentRate: raw.descent_rate,
    burstAltitude: raw.burst_altitude,
    descending,
    landed: Boolean(raw.landed),
    path,
    landing: path[path.length - 1] ?? null,
    burst,
  };
}

export async function fetchPredictions(signal?: AbortSignal): Promise<Prediction[]> {
  const raw = await getJSON<RawPrediction[]>('/predictions', signal);
  return raw.map(normalisePrediction).filter((p): p is Prediction => p !== null);
}

interface RawListener {
  uploader_callsign: string;
  uploader_position?: number[];
  uploader_antenna?: string;
  software_name?: string;
  software_version?: string;
  mobile?: boolean;
  ts?: string;
}

export function normaliseListener(raw: RawListener, fallbackTime = Date.now()): Listener | null {
  const pos = raw.uploader_position;
  if (!raw.uploader_callsign || !Array.isArray(pos) || pos.length < 2) return null;
  const [lat, lon, alt] = pos.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return {
    callsign: decodeEntities(raw.uploader_callsign),
    lat,
    lon,
    alt: Number.isFinite(alt) ? alt : undefined,
    mobile: raw.mobile === true,
    antenna: raw.uploader_antenna,
    software: [raw.software_name, raw.software_version].filter(Boolean).join(' '),
    lastSeen: raw.ts ? Date.parse(raw.ts) : fallbackTime,
  };
}

export async function fetchListeners(signal?: AbortSignal): Promise<Listener[]> {
  const raw = await getJSON<Record<string, Record<string, RawListener>>>('/listeners/telemetry?duration=1d', signal);
  const out: Listener[] = [];
  for (const byTime of Object.values(raw)) {
    // Keep only the latest report of each station.
    const latestKey = Object.keys(byTime).sort().pop();
    if (!latestKey) continue;
    const l = normaliseListener(byTime[latestKey], Date.parse(latestKey));
    if (l) out.push(l);
  }
  return out;
}

interface RawSite {
  station_name: string;
  station: string;
  position: [number, number];
  alt?: number;
  rs_types?: (string | string[])[];
  times?: string[];
  ascent_rate?: number;
  descent_rate?: number;
  burst_altitude?: number;
  notes?: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export async function fetchSites(signal?: AbortSignal): Promise<LaunchSite[]> {
  const raw = await getJSON<Record<string, RawSite>>('/sites', signal);
  return Object.values(raw)
    .filter((s) => Array.isArray(s.position))
    .map((s) => ({
      id: s.station,
      name: s.station_name,
      lon: s.position[0],
      lat: s.position[1],
      alt: s.alt,
      types: (s.rs_types ?? []).map((t) => String(Array.isArray(t) ? t[0] : t)),
      times: s.times ?? [],
      ascentRate: num(s.ascent_rate),
      descentRate: num(s.descent_rate),
      burstAltitude: num(s.burst_altitude),
      notes: typeof s.notes === 'string' && s.notes.trim() ? s.notes.trim() : undefined,
    }));
}

export interface RawReverse {
  serial: string;
  datetime: string;
  position: [number, number];
  launch_site?: string;
  launch_site_range_estimate?: number;
  data?: PredictionPoint[] | string;
}

export function normaliseReverse(r: RawReverse): ReversePrediction | null {
  const t = Date.parse(r?.datetime);
  if (!r?.serial || !Array.isArray(r.position) || !Number.isFinite(t)) return null;
  const [lon, lat] = r.position.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let path: unknown = r.data ?? [];
  if (typeof path === 'string') {
    try {
      path = JSON.parse(path);
    } catch {
      path = [];
    }
  }
  return {
    serial: r.serial,
    launchTime: t,
    lat,
    lon: lon > 180 ? lon - 360 : lon,
    site: r.launch_site ?? null,
    siteRange: num(r.launch_site_range_estimate),
    path: Array.isArray(path) ? (path as PredictionPoint[]) : [],
  };
}

const REVERSE_WINDOW: Record<string, string> = { '1h': '3h', '3h': '6h', '6h': '12h', '12h': '1d', '1d': '1d' };

export async function fetchReverse(duration: string, signal?: AbortSignal): Promise<ReversePrediction[]> {
  const raw = await getJSON<Record<string, RawReverse>>(`/predictions/reverse?vehicles=&duration=${REVERSE_WINDOW[duration] ?? '6h'}`, signal);
  return Object.values(raw)
    .map(normaliseReverse)
    .filter((r): r is ReversePrediction => r !== null);
}

export interface FlightProfile {
  ascentRate: number;
  descentRate: number;
  burstAltitude: number;
}

export function siteProfile(site: LaunchSite): FlightProfile {
  const lms6 = site.types.includes('11') || site.types.includes('82');
  return {
    ascentRate: site.ascentRate ?? 5,
    descentRate: site.descentRate ?? (lms6 ? 2.5 : 6),
    burstAltitude: site.burstAltitude ?? (lms6 ? 33500 : 26000),
  };
}

interface RawTawhiriPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  datetime: string;
}

interface RawTawhiri {
  prediction?: { stage: string; trajectory: RawTawhiriPoint[] }[];
  error?: { description?: string };
}

export async function fetchSiteForecast(site: LaunchSite, launchTime: number, signal?: AbortSignal): Promise<SiteForecast> {
  const profile = siteProfile(site);
  const q = new URLSearchParams({
    launch_latitude: String(site.lat),
    launch_longitude: String(((site.lon % 360) + 360) % 360),
    launch_datetime: new Date(launchTime).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ascent_rate: String(profile.ascentRate),
    burst_altitude: String(profile.burstAltitude),
    descent_rate: String(profile.descentRate),
  });
  const res = await fetch(`${API}/tawhiri?${q}`, { signal });
  const data = (await res.json().catch(() => ({}))) as RawTawhiri;
  if (!res.ok || !data.prediction) throw new Error(data.error?.description ?? `Tawhiri ${res.status}`);
  const toPoint = (p: RawTawhiriPoint): PredictionPoint => ({
    time: Date.parse(p.datetime) / 1000,
    lat: p.latitude,
    lon: p.longitude > 180 ? p.longitude - 360 : p.longitude,
    alt: p.altitude,
  });
  const ascent = data.prediction.find((s) => s.stage === 'ascent')?.trajectory ?? [];
  const descent = data.prediction.find((s) => s.stage === 'descent')?.trajectory ?? [];
  const path = [...ascent, ...descent].map(toPoint);
  if (path.length < 2) throw new Error(t('lib.api.emptyForecast'));
  return {
    launchTime,
    burst: toPoint(ascent[ascent.length - 1] ?? descent[0]),
    landing: path[path.length - 1],
    path,
  };
}

const HISTORY = 'https://sondehub-history.s3.amazonaws.com';

export interface ArchivedFlight {
  key: string;
  serial: string;
  date: string;
}

export async function listSiteFlights(siteId: string, year: number, month: number, signal?: AbortSignal): Promise<ArchivedFlight[]> {
  const mm = String(month).padStart(2, '0');
  const prefix = `launchsites/${siteId}/${year}/${mm}/`;
  const out = new Map<string, ArchivedFlight>();
  let token: string | undefined;
  do {
    const q = new URLSearchParams({ 'list-type': '2', prefix });
    if (token) q.set('continuation-token', token);
    const res = await fetch(`${HISTORY}/?${q}`, { signal });
    if (!res.ok) throw new Error(t('lib.api.archiveError', { status: res.status }));
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      const key = decodeEntities(m[1]);
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0 || !rest.endsWith('.json')) continue;
      const serial = rest.slice(slash + 1, -5);
      if (!out.has(serial)) out.set(serial, { key, serial, date: `${year}-${mm}-${rest.slice(0, slash).padStart(2, '0')}` });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] : undefined;
  } while (token);
  return [...out.values()];
}

export async function fetchPastFlight(f: ArchivedFlight, signal?: AbortSignal): Promise<PastFlight | null> {
  const res = await fetch(`${HISTORY}/${f.key.split('/').map(encodeURIComponent).join('/')}`, { signal });
  if (!res.ok) return null;
  const raw = (await res.json()) as Frame[];
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const point = (x: Frame): FlightPoint | null => {
    const time = Date.parse(x?.datetime);
    return Number.isFinite(time) && Number.isFinite(x.lat) && Number.isFinite(x.lon) && Number.isFinite(x.alt) ? { time, lat: x.lat, lon: x.lon, alt: x.alt } : null;
  };
  const [first, top, last] = raw.map(point);
  if (!first || !top || !last) return null;
  return { serial: f.serial, type: raw[0].subtype ?? raw[0].type, first, top, last };
}

export interface RawRecovery {
  serial: string;
  lat: number;
  lon: number;
  recovered: boolean;
  planned?: boolean;
  recovered_by?: string;
  description?: string;
  datetime: string;
}

export function normaliseRecovery(r: RawRecovery): Recovery {
  return {
    serial: r.serial,
    lat: r.lat,
    lon: r.lon,
    recovered: r.recovered,
    planned: r.planned,
    recoveredBy: r.recovered_by,
    description: r.description,
    datetime: Date.parse(r.datetime),
  };
}

export async function fetchRecoveries(signal?: AbortSignal): Promise<Recovery[]> {
  const raw = await getJSON<RawRecovery[]>('/recovered?last=259200', signal);
  return raw.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)).map(normaliseRecovery);
}

export interface RecoveryReport {
  serial: string;
  lat: number;
  lon: number;
  alt: number;
  /** true = sonde found; false = searched but not found. */
  recovered: boolean;
  /** true = not picked up yet but someone intends to. */
  planned: boolean;
  recovered_by: string;
  description: string;
}

/**
 * Publishes a recovery report to SondeHub (PUT /recovered, public and visible to everyone).
 * Only call this after an explicit user confirmation.
 */
export async function submitRecovery(report: RecoveryReport): Promise<void> {
  const res = await fetch(`${API}/recovered`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Date: new Date().toUTCString() },
    body: JSON.stringify({ ...report, recovery_software: 'SondeHubV2' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || t('lib.api.sondehubError', { status: res.status }));
  }
}
