import { create } from 'zustand';
import type { FlightPhase, Frame, LaunchSite, Listener, Prediction, Recovery, ReceiverHit, Sonde, TrackPoint } from '../lib/types';
import type { TelemetryResponse } from '../lib/api';
import { parseLatLon } from '../lib/geo';
import type { Units } from '../lib/format';
import { decodeEntities } from '../lib/text';

export type Duration = '1h' | '3h' | '6h' | '12h' | '1d';
export const DURATION_MS: Record<Duration, number> = {
  '1h': 3_600_000,
  '3h': 10_800_000,
  '6h': 21_600_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
};

export type BasemapId = 'dark' | 'liberty' | 'positron' | 'satellite' | 'topo' | 'osm';
export type ConnState = 'connecting' | 'live' | 'offline';

export interface Layers {
  listeners: boolean;
  chase: boolean;
  sites: boolean;
  recoveries: boolean;
  landings: boolean;
  allPredictions: boolean;
  receiverLinks: boolean;
}

export interface AlertSettings {
  /** Warn when a predicted landing falls within `radiusKm` of the user's position. */
  enabled: boolean;
  radiusKm: number;
  /** Also warn shortly before followed (favourite) sondes land, wherever they are. */
  favourites: boolean;
  /** Use system notifications (when permitted) in addition to in-app toasts. */
  system: boolean;
}

export interface Settings {
  theme: 'dark' | 'light';
  basemap: BasemapId;
  units: Units;
  duration: Duration;
  layers: Layers;
  terrain3d: boolean;
  /** Serials the user follows; shown first and eligible for alerts. */
  favourites: string[];
  alerts: AlertSettings;
  /** Callsign / name remembered for recovery reports. */
  callsign: string;
  /** Set once the welcome card has been dismissed. */
  onboarded: boolean;
  techOpen: boolean;
}

/** Imperial units for locales that use them (US, Liberia, Myanmar); metric elsewhere. */
function localeUnits(): Units {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region === 'US' || region === 'LR' || region === 'MM' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  basemap: 'positron',
  units: localeUnits(),
  favourites: [],
  alerts: { enabled: false, radiusKm: 50, favourites: true, system: true },
  callsign: '',
  onboarded: false,
  techOpen: false,
  duration: '3h',
  terrain3d: false,
  layers: {
    listeners: true,
    chase: true,
    sites: true,
    recoveries: false,
    landings: true,
    allPredictions: false,
    receiverLinks: true,
  },
};

const SETTINGS_KEY = 'sondetrack.settings.v1';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      layers: { ...DEFAULT_SETTINGS.layers, ...parsed.layers },
      alerts: { ...DEFAULT_SETTINGS.alerts, ...parsed.alerts },
      favourites: Array.isArray(parsed.favourites) ? parsed.favourites : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings simply won't persist */
  }
}

/** Live (non-selected) tracks keep one point every N ms to bound memory and render cost. */
const LIVE_DECIMATION_MS = 10_000;
/** No frame for this long → presumed landed (if it was descending) or lost. */
const LOST_AFTER_MS = 20 * 60_000;

export function computePhase(s: Pick<Sonde, 'last' | 'lastTime' | 'track' | 'maxAlt'>, now = Date.now()): FlightPhase {
  const f = s.last;
  let vv = f.vel_v;
  if (vv === undefined || !Number.isFinite(vv)) {
    const n = s.track.length;
    if (n >= 2) {
      const [, , a1, t1] = s.track[n - 2];
      const [, , a2, t2] = s.track[n - 1];
      vv = t2 > t1 ? (a2 - a1) / ((t2 - t1) / 1000) : 0;
    } else vv = 0;
  }
  const still = Math.abs(vv) < 1 && (f.vel_h ?? 0) < 3;
  // A sonde close to the ground and not moving has landed (or is waiting on the pad).
  if (still && (f.alt < 4000 || s.maxAlt - f.alt > 2000)) return 'landed';
  if (now - s.lastTime > LOST_AFTER_MS) {
    // Descending sondes usually drop below the receivers' horizon before touchdown:
    // after this long without a frame they are on the ground, just not heard any more.
    return vv < 0 || f.alt < 3000 ? 'landed' : 'lost';
  }
  return vv >= 0 ? 'ascending' : 'descending';
}

function frameTime(f: Frame): number {
  const t = Date.parse(f.datetime);
  return Number.isFinite(t) ? t : Date.now();
}

function isValidFrame(f: Frame): boolean {
  return (
    typeof f?.serial === 'string' &&
    Number.isFinite(f.lat) &&
    Number.isFinite(f.lon) &&
    Number.isFinite(f.alt) &&
    !(f.lat === 0 && f.lon === 0)
  );
}

function newSonde(f: Frame): Sonde {
  return {
    serial: f.serial,
    type: f.type,
    subtype: f.subtype,
    manufacturer: f.manufacturer,
    last: f,
    lastTime: frameTime(f),
    track: [],
    maxAlt: -Infinity,
    maxAltIdx: -1,
    receivers: {},
    phase: 'ascending',
  };
}

function insertPoint(track: TrackPoint[], p: TrackPoint, minGap: number): boolean {
  const n = track.length;
  if (n === 0 || p[3] > track[n - 1][3]) {
    if (n > 0 && p[3] - track[n - 1][3] < minGap) return false;
    track.push(p);
    return true;
  }
  // Out-of-order frame (late receiver): binary insert, skipping duplicates.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid][3] < p[3]) lo = mid + 1;
    else hi = mid;
  }
  if (lo < n && track[lo][3] === p[3]) return false;
  if (minGap > 0) return false; // decimated tracks ignore late points
  track.splice(lo, 0, p);
  return true;
}

function recordReceiver(s: Sonde, f: Frame, t: number) {
  const add = (raw: string | undefined, extra: Partial<ReceiverHit>) => {
    if (!raw) return;
    const callsign = decodeEntities(raw);
    const prev = s.receivers[callsign];
    if (prev && prev.lastHeard > t) return;
    s.receivers[callsign] = { ...prev, callsign, lastHeard: t, ...extra };
  };
  add(f.uploader_callsign, {
    snr: f.snr,
    rssi: f.rssi,
    frequency: f.frequency,
    position: parseLatLon(f.uploader_position),
    antenna: f.uploader_antenna,
    software: [f.software_name, f.software_version].filter(Boolean).join(' ') || undefined,
  });
  for (const u of f.uploaders ?? []) {
    if (u.uploader_callsign !== f.uploader_callsign) add(u.uploader_callsign, { snr: u.snr, rssi: u.rssi, frequency: u.frequency });
  }
}

/** Mutates `s` with a new frame. Returns a fresh object so React/memo notices the change. */
function applyFrame(s: Sonde, f: Frame, minGap: number): Sonde {
  const t = frameTime(f);
  const num = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  // Some decoders report -273 °C or 0 % when the sensor is absent.
  const temp = num(f.temp) > -270 ? num(f.temp) : NaN;
  const p: TrackPoint = [f.lon, f.lat, f.alt, t, temp, num(f.humidity), num(f.vel_v)];
  const inserted = insertPoint(s.track, p, minGap);
  if (inserted && f.alt > s.maxAlt) {
    s.maxAlt = f.alt;
    s.maxAltIdx = s.track.indexOf(p);
  } else if (inserted && s.maxAltIdx >= 0 && s.track[s.maxAltIdx] !== undefined && s.track[s.maxAltIdx][3] > t) {
    // A late point was spliced before the max: re-locate it.
    s.maxAltIdx = s.track.findIndex((q) => q[2] === s.maxAlt);
  }
  recordReceiver(s, f, t);
  if (t >= s.lastTime) {
    // Some decoders omit fields in some frames: keep the last known value.
    s.last = { ...s.last, ...f };
    s.lastTime = t;
    s.type = f.type ?? s.type;
    s.subtype = f.subtype ?? s.subtype;
    s.manufacturer = f.manufacturer ?? s.manufacturer;
  }
  return { ...s };
}

function recomputeMax(s: Sonde) {
  let max = -Infinity;
  let idx = -1;
  s.track.forEach((p, i) => {
    if (p[2] > max) {
      max = p[2];
      idx = i;
    }
  });
  s.maxAlt = max;
  s.maxAltIdx = idx;
}

export interface UserLocation {
  lat: number;
  lon: number;
  accuracy: number;
  alt?: number;
}

interface State {
  settings: Settings;
  sondes: Record<string, Sonde>;
  predictions: Record<string, Prediction>;
  listeners: Record<string, Listener>;
  sites: LaunchSite[];
  recoveries: Record<string, Recovery>;

  selected: string | null;
  hovered: string | null;
  follow: boolean;
  query: string;
  phaseFilter: Record<FlightPhase, boolean>;
  typeFilter: string | null;
  userLocation: UserLocation | null;

  loading: boolean;
  error: string | null;
  conn: ConnState;
  msgRate: number;
  lastUpdate: number;
  /** Bumped every few seconds so relative times re-render. */
  now: number;
  /** Set by the map to request a camera move. */
  flyTo: { lon: number; lat: number; zoom?: number; id: number } | null;

  setSettings: (patch: Partial<Settings>) => void;
  setLayer: (key: keyof Layers, value: boolean) => void;
  toggleFavourite: (serial: string) => void;
  setAlerts: (patch: Partial<AlertSettings>) => void;
  loadTelemetry: (data: TelemetryResponse, replace: boolean) => void;
  mergeHistory: (serial: string, data: TelemetryResponse) => void;
  ingest: (frames: Frame[]) => void;
  setPredictions: (preds: Prediction[], replace: boolean) => void;
  setListeners: (ls: Listener[]) => void;
  setSites: (s: LaunchSite[]) => void;
  setRecoveries: (r: Recovery[], replace: boolean) => void;
  select: (serial: string | null, fly?: boolean) => void;
  setHovered: (serial: string | null) => void;
  setFollow: (v: boolean) => void;
  setQuery: (q: string) => void;
  togglePhase: (p: FlightPhase) => void;
  setTypeFilter: (t: string | null) => void;
  setUserLocation: (l: UserLocation | null) => void;
  setConn: (c: ConnState, rate?: number) => void;
  setLoading: (v: boolean, error?: string | null) => void;
  requestFly: (lon: number, lat: number, zoom?: number) => void;
  tick: () => void;
}

export const useStore = create<State>((set, get) => ({
  settings: loadSettings(),
  sondes: {},
  predictions: {},
  listeners: {},
  sites: [],
  recoveries: {},

  selected: null,
  hovered: null,
  follow: false,
  query: '',
  phaseFilter: { ascending: true, descending: true, landed: true, lost: true },
  typeFilter: null,
  userLocation: null,

  loading: true,
  error: null,
  conn: 'connecting',
  msgRate: 0,
  lastUpdate: 0,
  now: Date.now(),
  flyTo: null,

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },

  toggleFavourite: (serial) => {
    const favs = get().settings.favourites;
    get().setSettings({ favourites: favs.includes(serial) ? favs.filter((f) => f !== serial) : [...favs, serial] });
  },

  setAlerts: (patch) => get().setSettings({ alerts: { ...get().settings.alerts, ...patch } }),

  setLayer: (key, value) => {
    const settings = { ...get().settings, layers: { ...get().settings.layers, [key]: value } };
    saveSettings(settings);
    set({ settings });
  },

  loadTelemetry: (data, replace) => {
    const sondes: Record<string, Sonde> = replace ? {} : { ...get().sondes };
    const now = Date.now();
    for (const [serial, byTime] of Object.entries(data)) {
      const frames = Object.values(byTime).filter(isValidFrame).sort((a, b) => frameTime(a) - frameTime(b));
      if (frames.length === 0) continue;
      let s = sondes[serial] ?? newSonde(frames[0]);
      for (const f of frames) s = applyFrame(s, f, 0);
      s.phase = computePhase(s, now);
      sondes[serial] = s;
    }
    set({ sondes, lastUpdate: now });
  },

  mergeHistory: (serial, data) => {
    const byTime = data[serial];
    if (!byTime) return;
    const existing = get().sondes[serial];
    const frames = Object.values(byTime).filter(isValidFrame).sort((a, b) => frameTime(a) - frameTime(b));
    if (frames.length === 0) return;
    let s = existing ?? newSonde(frames[0]);
    for (const f of frames) s = applyFrame(s, f, 0);
    recomputeMax(s);
    s.detailed = true;
    s.phase = computePhase(s);
    set({ sondes: { ...get().sondes, [serial]: s } });
  },

  ingest: (frames) => {
    if (frames.length === 0) return;
    const { selected } = get();
    const sondes = { ...get().sondes };
    const touched = new Set<string>();
    for (const f of frames) {
      if (!isValidFrame(f)) continue;
      const s = sondes[f.serial] ?? newSonde(f);
      sondes[f.serial] = applyFrame(s, f, f.serial === selected ? 0 : LIVE_DECIMATION_MS);
      touched.add(f.serial);
    }
    const now = Date.now();
    for (const serial of touched) sondes[serial].phase = computePhase(sondes[serial], now);
    set({ sondes, lastUpdate: now });
  },

  setPredictions: (preds, replace) => {
    const predictions = replace ? {} : { ...get().predictions };
    for (const p of preds) predictions[p.serial] = p;
    set({ predictions });
  },

  setListeners: (ls) => {
    const listeners = { ...get().listeners };
    for (const l of ls) {
      const prev = listeners[l.callsign];
      if (!prev || prev.lastSeen <= l.lastSeen) listeners[l.callsign] = l;
    }
    set({ listeners });
  },

  setSites: (sites) => set({ sites }),

  setRecoveries: (r, replace) => {
    const recoveries = replace ? {} : { ...get().recoveries };
    for (const x of r) recoveries[x.serial] = x;
    set({ recoveries });
  },

  select: (serial, fly = false) => {
    set({ selected: serial, follow: serial ? get().follow : false });
    if (serial && fly) {
      const s = get().sondes[serial];
      if (s) get().requestFly(s.last.lon, s.last.lat, 10);
    }
  },

  setHovered: (hovered) => set({ hovered }),
  setFollow: (follow) => set({ follow }),
  setQuery: (query) => set({ query }),
  togglePhase: (p) => set({ phaseFilter: { ...get().phaseFilter, [p]: !get().phaseFilter[p] } }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setUserLocation: (userLocation) => set({ userLocation }),
  setConn: (conn, rate) => set({ conn, msgRate: rate ?? get().msgRate }),
  setLoading: (loading, error = null) => set({ loading, error }),
  requestFly: (lon, lat, zoom) => set({ flyTo: { lon, lat, zoom, id: Math.random() } }),

  tick: () => {
    const now = Date.now();
    const { settings, selected } = get();
    const cutoff = now - DURATION_MS[settings.duration];
    const sondes: Record<string, Sonde> = {};
    let changed = false;
    for (const [serial, s] of Object.entries(get().sondes)) {
      if (s.lastTime < cutoff && serial !== selected && !settings.favourites.includes(serial)) {
        changed = true;
        continue;
      }
      const phase = computePhase(s, now);
      if (phase !== s.phase) {
        sondes[serial] = { ...s, phase };
        changed = true;
      } else sondes[serial] = s;
    }
    set(changed ? { sondes, now } : { now });
  },
}));
