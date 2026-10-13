import type { Frame, LaunchSite, Listener, Prediction, PredictionPoint, Recovery } from './types';
import { decodeEntities } from './text';

const API = 'https://api.v2.sondehub.org';

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal });
  if (!res.ok) throw new Error(`SondeHub API ${res.status} sur ${path}`);
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
  rs_types?: string[];
  times?: string[];
}

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
      types: s.rs_types ?? [],
      times: s.times ?? [],
    }));
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
    throw new Error(text || `Erreur SondeHub ${res.status}`);
  }
}
