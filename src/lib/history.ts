import type { FlightPoint, Frame, LaunchSite, PastFlight, Sonde } from './types';
import { fetchPastFlight, fetchSondeHistory, listSiteFlights, type TelemetryResponse } from './api';
import { bearing, distance } from './geo';
import { pickFlight } from './sonde';
import { useStore } from '@/store/useStore';

export const HISTORY_OVERLAY = '__history';

const API = 'https://api.v2.sondehub.org';
const DAY_MS = 86_400_000;
const SITE_TTL_MS = 15 * 60_000;
const LIVE_RETENTION_MS = 2.5 * DAY_MS;
export const HISTORY_MAX_DAYS = 30;

export interface HistoryEntry {
  serial: string;
  type?: string;
  launch?: FlightPoint;
  top?: FlightPoint;
  last: FlightPoint;
  site?: LaunchSite;
  recent: boolean;
}

export interface Zone {
  lat: number;
  lon: number;
  radiusM: number;
}

const siteCache = new Map<string, { at: number; promise: Promise<PastFlight[]> }>();

async function siteFlightsFromApi(siteId: string, signal?: AbortSignal): Promise<PastFlight[]> {
  const res = await fetch(`/api/site-flights?site=${encodeURIComponent(siteId)}`, { signal });
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(String(res.status));
  const body = (await res.json()) as { flights?: PastFlight[] };
  if (!Array.isArray(body.flights)) throw new Error('bad payload');
  return body.flights;
}

async function siteFlightsFromS3(siteId: string, signal?: AbortSignal): Promise<PastFlight[]> {
  const now = Date.now();
  const since = now - HISTORY_MAX_DAYS * DAY_MS;
  const d = new Date(now);
  const months: [number, number][] = [
    [d.getUTCFullYear(), d.getUTCMonth() + 1],
    d.getUTCMonth() === 0 ? [d.getUTCFullYear() - 1, 12] : [d.getUTCFullYear(), d.getUTCMonth()],
  ];
  const lists = await Promise.all(months.map(([y, m]) => listSiteFlights(siteId, y, m, signal)));
  const keys = lists.flat().filter((f) => Date.parse(f.date) >= since - DAY_MS);
  const out: (PastFlight | null)[] = [];
  let next = 0;
  const worker = async () => {
    while (next < keys.length && !signal?.aborted) {
      const f = keys[next++];
      out.push(await fetchPastFlight(f, signal).catch(() => null));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, keys.length) }, worker));
  return out.filter((f): f is PastFlight => f !== null && f.first.time >= since && f.first.time <= now).sort((a, b) => b.first.time - a.first.time);
}

export function fetchSiteFlights(siteId: string): Promise<PastFlight[]> {
  const hit = siteCache.get(siteId);
  if (hit && Date.now() - hit.at < SITE_TTL_MS) return hit.promise;
  const promise = siteFlightsFromApi(siteId).catch(() => siteFlightsFromS3(siteId));
  siteCache.set(siteId, { at: Date.now(), promise });
  promise.catch(() => siteCache.delete(siteId));
  return promise;
}

export async function fetchRecentNear(lat: number, lon: number, radiusM: number, seconds: number, signal?: AbortSignal): Promise<Frame[]> {
  const q = new URLSearchParams({
    lat: (Math.round(lat * 10) / 10).toFixed(1),
    lon: (Math.round(lon * 10) / 10).toFixed(1),
    distance: String(Math.round(radiusM + 8000)),
    last: String(Math.round(seconds)),
  });
  const res = await fetch(`${API}/sondes?${q}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const raw = (await res.json()) as Record<string, Frame>;
  return Object.values(raw).filter(
    (f) => f && typeof f.serial === 'string' && Number.isFinite(f.lat) && Number.isFinite(f.lon) && Number.isFinite(f.alt) && distance(lat, lon, f.lat, f.lon) <= radiusM,
  );
}

const hints = new Map<string, number>();

export function rememberFlight(serial: string, lastTime: number) {
  hints.set(serial, lastTime);
}

function hasFrames(data: TelemetryResponse | null | undefined, serial: string): data is TelemetryResponse {
  const byTime = data?.[serial];
  return !!byTime && Object.keys(byTime).length > 0;
}

async function fetchRecentHistory(serial: string, signal?: AbortSignal): Promise<TelemetryResponse> {
  const res = await fetch(`${API}/sondes/telemetry?serial=${encodeURIComponent(serial)}&duration=3d`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<TelemetryResponse>;
}

export async function fetchArchivedFlight(serial: string, signal?: AbortSignal): Promise<TelemetryResponse | null> {
  const res = await fetch(`/api/flight?serial=${encodeURIComponent(serial)}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(String(res.status));
  return res.json() as Promise<TelemetryResponse>;
}

export interface LoadedHistory {
  data: TelemetryResponse;
  archived: boolean;
}

function narrow(loaded: LoadedHistory, serial: string, near: number | undefined): LoadedHistory {
  const frames = pickFlight(
    Object.values(loaded.data[serial]).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime)),
    near,
  );
  return { ...loaded, data: { ...loaded.data, [serial]: Object.fromEntries(frames.map((f) => [f.datetime, f])) } };
}

export async function loadSondeHistory(serial: string, live: Sonde | undefined, signal?: AbortSignal): Promise<LoadedHistory | null> {
  const loaded = await loadAnyHistory(serial, live, signal);
  return loaded ? narrow(loaded, serial, hints.get(serial)) : null;
}

async function loadAnyHistory(serial: string, live: Sonde | undefined, signal?: AbortSignal): Promise<LoadedHistory | null> {
  const hint = hints.get(serial);
  const old = hint !== undefined && Date.now() - hint > LIVE_RETENTION_MS;
  if ((live && !live.archived) || hint === undefined) {
    const data = await fetchSondeHistory(serial, signal).catch(() => null);
    if (hasFrames(data, serial)) return { data, archived: false };
  }
  if (!old) {
    const data = await fetchRecentHistory(serial, signal).catch(() => null);
    if (hasFrames(data, serial)) return { data, archived: !live || !!live.archived };
  }
  const archived = await fetchArchivedFlight(serial, signal);
  if (hasFrames(archived, serial)) return { data: archived, archived: true };
  if (old) {
    const data = await fetchRecentHistory(serial, signal).catch(() => null);
    if (hasFrames(data, serial)) return { data, archived: true };
  }
  return null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function mainDirection(bearings: number[]): number | null {
  if (bearings.length < 3) return null;
  let x = 0;
  let y = 0;
  for (const b of bearings) {
    x += Math.sin((b * Math.PI) / 180);
    y += Math.cos((b * Math.PI) / 180);
  }
  if (Math.hypot(x, y) / bearings.length < 0.35) return null;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

export function burstAltitude(e: Pick<HistoryEntry, 'top' | 'last'>): number | null {
  return e.top && e.top.alt - e.last.alt > 1000 ? e.top.alt : null;
}

export function drift(e: Pick<HistoryEntry, 'launch' | 'last'>): { d: number; b: number } | null {
  if (!e.launch) return null;
  return { d: distance(e.launch.lat, e.launch.lon, e.last.lat, e.last.lon), b: bearing(e.launch.lat, e.launch.lon, e.last.lat, e.last.lon) };
}

export function entryTime(e: HistoryEntry): number {
  return e.launch?.time ?? e.last.time;
}

const REACH_M = 300_000;
const MAX_SITES = 12;

export function sitesForZone(sites: LaunchSite[], zone: Zone): LaunchSite[] {
  return sites
    .map((s) => ({ s, d: distance(zone.lat, zone.lon, s.lat, s.lon) }))
    .filter((x) => x.d <= zone.radiusM + REACH_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_SITES)
    .map((x) => x.s);
}

export function inZone(zone: Zone, p: { lat: number; lon: number }): boolean {
  return distance(zone.lat, zone.lon, p.lat, p.lon) <= zone.radiusM;
}

export function entryFromSonde(s: Sonde): HistoryEntry {
  const first = s.track[0];
  const top = s.maxAltIdx >= 0 ? s.track[s.maxAltIdx] : undefined;
  const fromGround = !!first && first[2] < 3000;
  return {
    serial: s.serial,
    type: s.subtype ?? s.type,
    launch: fromGround ? { lon: first[0], lat: first[1], alt: first[2], time: first[3] } : undefined,
    top: top ? { lon: top[0], lat: top[1], alt: top[2], time: top[3] } : undefined,
    last: { lat: s.last.lat, lon: s.last.lon, alt: s.last.alt, time: s.lastTime },
    recent: true,
  };
}

export function entryFromFrame(f: Frame): HistoryEntry {
  return {
    serial: f.serial,
    type: f.subtype ?? f.type,
    last: { lat: f.lat, lon: f.lon, alt: f.alt, time: Date.parse(f.datetime) },
    recent: true,
  };
}

export function entryFromPast(f: PastFlight, site: LaunchSite): HistoryEntry {
  return { serial: f.serial, type: f.type, launch: f.first, top: f.top, last: f.last, site, recent: false };
}

export function toPastFlight(e: HistoryEntry): PastFlight {
  return { serial: e.serial, type: e.type, first: e.launch ?? e.last, top: e.top ?? e.last, last: e.last };
}

export function openHistoryEntry(e: Pick<HistoryEntry, 'serial' | 'launch' | 'last'>) {
  const st = useStore.getState();
  const known = st.sondes[e.serial];
  if (!known || known.archived) rememberFlight(e.serial, e.last.time);
  st.select(e.serial);
  const from = e.launch ?? e.last;
  const span = distance(from.lat, from.lon, e.last.lat, e.last.lon);
  st.requestFly((from.lon + e.last.lon) / 2, (from.lat + e.last.lat) / 2, span > 120_000 ? 7 : span > 50_000 ? 8 : 9);
}
