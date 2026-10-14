/** A raw telemetry frame as published by the SondeHub API / websocket feed. */
export interface Frame {
  serial: string;
  datetime: string;
  time_received?: string;
  lat: number;
  lon: number;
  alt: number;
  type?: string;
  subtype?: string;
  manufacturer?: string;
  frame?: number;
  temp?: number;
  humidity?: number;
  pressure?: number;
  vel_v?: number;
  vel_h?: number;
  heading?: number;
  sats?: number;
  batt?: number;
  frequency?: number;
  tx_frequency?: number;
  snr?: number;
  rssi?: number;
  burst_timer?: number;
  uploader_callsign?: string;
  uploader_position?: string | number[];
  uploader_antenna?: string;
  software_name?: string;
  software_version?: string;
  xdata?: string;
  uploaders?: { uploader_callsign: string; frequency?: number; snr?: number; rssi?: number }[];
}

/**
 * A compact track point: [lon, lat, alt, epochMs, temp, humidity, vel_v, pressure].
 * Missing sensor values are NaN.
 */
export type TrackPoint = [number, number, number, number, number, number, number, number];

export interface ReceiverHit {
  callsign: string;
  firstHeard?: number;
  lastHeard: number;
  frames?: number;
  heard?: [number, number, number, number, number][];
  snr?: number;
  rssi?: number;
  frequency?: number;
  position?: [number, number];
  antenna?: string;
  software?: string;
}

export type FlightPhase = 'ascending' | 'descending' | 'landed' | 'lost';

export interface Sonde {
  serial: string;
  type?: string;
  subtype?: string;
  manufacturer?: string;
  last: Frame;
  lastTime: number;
  track: TrackPoint[];
  maxAlt: number;
  /** Index into `track` of the highest point, used to place the burst marker. */
  maxAltIdx: number;
  receivers: Record<string, ReceiverHit>;
  phase: FlightPhase;
  /** True once the full-resolution history was fetched for this sonde. */
  detailed?: boolean;
}

export interface PredictionPoint {
  time: number; // epoch seconds
  lat: number;
  lon: number;
  alt: number;
}

export interface Prediction {
  serial: string;
  time: number;
  ascentRate: number;
  descentRate: number;
  burstAltitude: number;
  descending: boolean;
  landed: boolean;
  path: PredictionPoint[];
  landing: PredictionPoint | null;
  burst: PredictionPoint | null;
}

export interface Listener {
  callsign: string;
  lat: number;
  lon: number;
  alt?: number;
  mobile: boolean;
  antenna?: string;
  software?: string;
  lastSeen: number;
}

export interface LaunchSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  alt?: number;
  types: string[];
  times: string[];
  ascentRate?: number;
  descentRate?: number;
  burstAltitude?: number;
  notes?: string;
}

export interface ReversePrediction {
  serial: string;
  launchTime: number;
  lat: number;
  lon: number;
  site: string | null;
  siteRange?: number;
  path: PredictionPoint[];
}

export interface SiteForecast {
  launchTime: number;
  burst: PredictionPoint;
  landing: PredictionPoint;
  path: PredictionPoint[];
}

export interface FlightPoint {
  time: number;
  lat: number;
  lon: number;
  alt: number;
}

export interface PastFlight {
  serial: string;
  type?: string;
  first: FlightPoint;
  top: FlightPoint;
  last: FlightPoint;
}

export interface Recovery {
  serial: string;
  lat: number;
  lon: number;
  recovered: boolean;
  /** Not picked up yet, but someone announced they will. */
  planned?: boolean;
  recoveredBy?: string;
  description?: string;
  datetime: number;
}

export interface PredictionSample {
  at: number;
  lat: number;
  lon: number;
  landingTime: number;
  alt: number;
}
