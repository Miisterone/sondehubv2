import type { Prediction, Sonde } from './types';
import { isGlider } from './sonde';
import { bearing, distance } from './geo';
import { despikeValues } from './atmo';

const WINDOW_S = 10;
const SMOOTH_S = 20;
const MAX_H_SPEED = 150;
const MAX_V_SPEED = 150;

type Num = number | null;

export interface FlightData {
  x: number[];
  last: number;
  lat: number[];
  lon: number[];
  alt: Num[];
  altP: Num[];
  vv: Num[];
  vvP: Num[];
  hs: Num[];
  hsP: Num[];
  hdg: Num[];
  temp: Num[];
  hum: Num[];
  path: number[];
  burst: number | null;
  burstP: number | null;
  landingP: number | null;
  forecast: boolean;
  glider: boolean;
}

const fin = (v: number) => (Number.isFinite(v) ? v : null);
const normLon = (lon: number) => (lon > 180 ? lon - 360 : lon);

export function buildFlight(sonde: Sonde, prediction: Prediction | null): FlightData {
  const tr = sonde.track;
  const n = tr.length;
  const d: FlightData = {
    x: [],
    last: n - 1,
    lat: [],
    lon: [],
    alt: [],
    altP: [],
    vv: [],
    vvP: [],
    hs: [],
    hsP: [],
    hdg: [],
    temp: [],
    hum: [],
    path: [],
    burst: null,
    burstP: null,
    landingP: null,
    forecast: false,
    glider: isGlider(sonde),
  };

  let j = 0;
  let cum = 0;
  let anchor = 0;
  for (let i = 0; i < n; i++) {
    const p = tr[i];
    const t = p[3] / 1000;
    d.x.push(t);
    d.lat.push(p[1]);
    d.lon.push(p[0]);
    d.alt.push(p[2]);
    d.altP.push(null);
    d.vvP.push(null);
    d.hsP.push(null);
    d.temp.push(fin(p[4]));
    d.hum.push(fin(p[5]));

    if (i === 0) {
      d.vv.push(fin(p[6]));
      d.hs.push(null);
      d.hdg.push(null);
      d.path.push(0);
      continue;
    }
    while (j + 1 < i && t - d.x[j + 1] >= WINDOW_S) j++;
    const dt = t - d.x[j];
    const moved = distance(d.lat[j], d.lon[j], p[1], p[0]);
    const hs = dt > 0 ? moved / dt : NaN;
    d.hs.push(Number.isFinite(hs) && hs <= MAX_H_SPEED ? hs : null);
    d.hdg.push(dt > 0 && moved > 5 ? bearing(d.lat[j], d.lon[j], p[1], p[0]) : null);
    const vRaw = Number.isFinite(p[6]) ? p[6] : dt > 0 ? (p[2] - tr[j][2]) / dt : NaN;
    d.vv.push(Number.isFinite(vRaw) && Math.abs(vRaw) <= MAX_V_SPEED ? vRaw : null);

    const along = cum + distance(d.lat[anchor], d.lon[anchor], p[1], p[0]);
    if (t - d.x[anchor] >= WINDOW_S) {
      cum = along;
      anchor = i;
    }
    d.path.push(Math.max(d.path[i - 1], along));
  }

  smooth(d.x, d.vv, n);

  if (sonde.phase !== 'ascending' && sonde.maxAltIdx >= 0 && sonde.maxAltIdx < n && sonde.maxAlt - sonde.last.alt > 500) {
    d.burst = sonde.maxAltIdx;
  }

  if (!prediction || n === 0) return d;
  const lastT = d.x[n - 1];
  const future = prediction.path.filter((q) => q.time > lastT && Number.isFinite(q.alt));
  if (future.length === 0) return d;
  const before = prediction.path.filter((q) => q.time <= lastT).pop();

  d.forecast = true;
  d.altP[n - 1] = d.alt[n - 1];
  d.vvP[n - 1] = d.vv[n - 1];
  d.hsP[n - 1] = d.hs[n - 1];
  let prev = { t: lastT, lat: d.lat[n - 1], lon: d.lon[n - 1], alt: tr[n - 1][2] };
  let model = before ? { t: before.time, lat: before.lat, lon: normLon(before.lon), alt: before.alt } : prev;
  for (const q of future) {
    const lon = normLon(q.lon);
    const moved = distance(prev.lat, prev.lon, q.lat, lon);
    const dt = q.time - model.t;
    const step = distance(model.lat, model.lon, q.lat, lon);
    d.x.push(q.time);
    d.lat.push(q.lat);
    d.lon.push(lon);
    d.alt.push(null);
    d.altP.push(q.alt);
    d.vv.push(null);
    d.hs.push(null);
    d.vvP.push(dt > 0 ? (q.alt - model.alt) / dt : null);
    d.hsP.push(dt > 0 && step / dt <= MAX_H_SPEED ? step / dt : null);
    d.hdg.push(step > 5 ? bearing(model.lat, model.lon, q.lat, lon) : null);
    d.temp.push(null);
    d.hum.push(null);
    d.path.push(d.path[d.path.length - 1] + moved);
    prev = { t: q.time, lat: q.lat, lon, alt: q.alt };
    model = prev;
  }
  d.landingP = d.x.length - 1;
  if (prediction.burst && prediction.burst.time > lastT) {
    const k = d.x.indexOf(prediction.burst.time, n);
    if (k >= 0) d.burstP = k;
  }
  return d;
}

function smooth(x: number[], v: Num[], n: number) {
  const raw = v.slice(0, n);
  let lo = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const r = raw[i];
    if (r !== null) {
      sum += r;
      count++;
    }
    while (x[i] - x[lo] > SMOOTH_S) {
      const q = raw[lo];
      if (q !== null) {
        sum -= q;
        count--;
      }
      lo++;
    }
    v[i] = r === null || count === 0 ? null : sum / count;
  }
}

export function nearestIndex(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - v) < Math.abs(xs[lo] - v)) return lo - 1;
  return lo;
}

export interface Sounding {
  alt: number[];
  temp: Num[];
  hum: Num[];
}

export function buildSounding(sonde: Sonde): Sounding {
  const tr = sonde.track;
  const end = sonde.maxAltIdx >= 0 ? sonde.maxAltIdx + 1 : tr.length;
  const rows = tr
    .slice(0, end)
    .filter((p) => Number.isFinite(p[4]) || Number.isFinite(p[5]))
    .map((p) => [p[2], p[4], p[5]] as const)
    .sort((a, b) => a[0] - b[0]);
  const out: Sounding = { alt: [], temp: [], hum: [] };
  let lastAlt = -Infinity;
  for (const r of rows) {
    if (r[0] <= lastAlt) continue;
    lastAlt = r[0];
    out.alt.push(r[0]);
    out.temp.push(fin(r[1]));
    out.hum.push(fin(r[2]));
  }
  out.temp = despikeValues(out.temp, 2.5);
  out.hum = despikeValues(out.hum, 15);
  return out;
}

export function sampleTimes(d: FlightData, stepS: number): number[] {
  if (d.x.length === 0) return [];
  const out: number[] = [];
  const start = d.x[0];
  const end = d.x[d.x.length - 1];
  const first = Math.ceil(start / stepS) * stepS;
  out.push(0);
  for (let t = first; t < end; t += stepS) {
    const k = nearestIndex(d.x, t);
    if (k !== out[out.length - 1]) out.push(k);
  }
  if (d.last >= 0 && !out.includes(d.last)) out.push(d.last);
  if (d.burst !== null && !out.includes(d.burst)) out.push(d.burst);
  if (d.burstP !== null && !out.includes(d.burstP)) out.push(d.burstP);
  const end2 = d.x.length - 1;
  if (!out.includes(end2)) out.push(end2);
  return out.sort((a, b) => a - b);
}

export interface ReplayPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  vv: number | null;
  hs: number | null;
  hdg: number | null;
  temp: number | null;
  index: number;
}

export function replayAt(d: FlightData, t: number): ReplayPoint | null {
  const n = d.last + 1;
  if (n <= 0) return null;
  const xs = d.x;
  const tt = Math.max(xs[0], Math.min(xs[n - 1], t));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= tt) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const j = Math.min(n - 1, i + 1);
  const span = xs[j] - xs[i];
  const k = span > 0 ? (tt - xs[i]) / span : 0;
  const lerp = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + (b - a) * k);
  return {
    t: tt,
    lat: d.lat[i] + (d.lat[j] - d.lat[i]) * k,
    lon: d.lon[i] + (d.lon[j] - d.lon[i]) * k,
    alt: lerp(d.alt[i], d.alt[j]) ?? 0,
    vv: lerp(d.vv[i], d.vv[j]),
    hs: lerp(d.hs[i], d.hs[j]),
    hdg: d.hdg[k < 0.5 ? i : j] ?? d.hdg[i],
    temp: lerp(d.temp[i], d.temp[j]),
    index: k < 0.5 ? i : j,
  };
}
