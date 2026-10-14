import type { Sonde } from './types';

const RD = 287.04;
const CP = 1005.7;
const G = 9.80665;
const LV = 2.501e6;
const EPS = 0.622;
const KAPPA = RD / CP;
const K0 = 273.15;
const M_PER_DEG = 111_195;

export interface Level {
  z: number;
  p: number;
  t: number | null;
  rh: number | null;
  td: number | null;
}

export interface WindLevel {
  z: number;
  p: number | null;
  u: number;
  v: number;
  speed: number;
  dir: number;
}

export interface Indices {
  cape: number | null;
  cin: number | null;
  li: number | null;
  k: number | null;
  tt: number | null;
  lcl: { p: number; z: number; t: number } | null;
  lfc: number | null;
  el: number | null;
  freezing: number | null;
  pw: number | null;
  tropopause: { p: number; z: number; t: number } | null;
  shear06: number | null;
  shear01: number | null;
  surfaceBased: boolean;
}

export interface Profile {
  levels: Level[];
  measuredPressure: boolean;
  winds: WindLevel[];
  parcel: { p: number; t: number }[];
  indices: Indices;
}

export function satVapour(tC: number): number {
  return 6.112 * Math.exp((17.67 * tC) / (tC + 243.5));
}

export function dewpoint(tC: number, rh: number): number | null {
  if (!(rh > 0)) return null;
  const g = Math.log(Math.min(rh, 100) / 100) + (17.62 * tC) / (243.12 + tC);
  return (243.12 * g) / (17.62 - g);
}

export function mixingRatio(p: number, tdC: number): number {
  const e = satVapour(tdC);
  return (EPS * e) / Math.max(1, p - e);
}

export function mixingRatioTemp(p: number, w: number): number {
  const e = (w * p) / (EPS + w);
  const l = Math.log(e / 6.112);
  return (243.5 * l) / (17.67 - l);
}

export function dryAdiabat(thetaK: number, p: number): number {
  return thetaK * Math.pow(p / 1000, KAPPA) - K0;
}

function moistLapse(p: number, tK: number): number {
  const rs = mixingRatio(p, tK - K0);
  return ((RD * tK + LV * rs) / (CP + (LV * LV * rs * EPS) / (RD * tK * tK))) / p;
}

export function moistAdiabat(p0: number, t0: number, targets: number[]): number[] {
  const order = targets.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  const out = new Array<number>(targets.length);
  let p = p0;
  let t = t0 + K0;
  const step = (to: number) => {
    while (Math.abs(to - p) > 1e-6) {
      const h = Math.sign(to - p) * Math.min(5, Math.abs(to - p));
      const k1 = moistLapse(p, t);
      const k2 = moistLapse(p + h / 2, t + (h / 2) * k1);
      t += h * k2;
      p += h;
    }
  };
  for (const [target, i] of order) {
    step(target);
    out[i] = t - K0;
  }
  return out;
}

function isaPressure(h: number): number {
  if (h < 11000) return 1013.25 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
  if (h < 20000) return 226.32 * Math.exp(-(h - 11000) / 6341.6);
  return 54.749 * Math.pow(1 + (h - 20000) / 216650, -34.1632);
}

function isaTemp(h: number): number {
  return h < 11000 ? 15 - 0.0065 * h : h < 20000 ? -56.5 : -56.5 + 0.001 * (h - 20000);
}

function ascent(sonde: Sonde) {
  const tr = sonde.track;
  const end = sonde.maxAltIdx >= 0 ? sonde.maxAltIdx + 1 : tr.length;
  const rows = tr.slice(0, end).filter((p) => Number.isFinite(p[2]));
  rows.sort((a, b) => a[3] - b[3]);
  return rows;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
}

export function despikeValues(values: (number | null)[], tolerance: number, half = 4): (number | null)[] {
  return values.map((v, i) => {
    if (v === null) return v;
    const win: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const w = values[j];
      if (w !== null) win.push(w);
    }
    return win.length >= 5 && Math.abs(v - median(win)) > tolerance ? null : v;
  });
}

function despike(pts: { t: number | null; rh: number | null }[], key: 't' | 'rh', tolerance: number) {
  const clean = despikeValues(
    pts.map((x) => x[key]),
    tolerance,
  );
  pts.forEach((x, i) => (x[key] = clean[i]));
}

export function buildProfile(sonde: Sonde): Profile | null {
  const rows = ascent(sonde);
  if (rows.length < 20) return null;
  const sorted = [...rows].sort((a, b) => a[2] - b[2]);
  const pts: { z: number; t: number | null; rh: number | null; p: number | null }[] = [];
  let lastZ = -Infinity;
  for (const r of sorted) {
    if (r[2] - lastZ < 5) continue;
    lastZ = r[2];
    pts.push({
      z: r[2],
      t: Number.isFinite(r[4]) && r[4] > -100 && r[4] < 60 ? r[4] : null,
      rh: Number.isFinite(r[5]) && r[5] >= 0 && r[5] <= 105 ? r[5] : null,
      p: Number.isFinite(r[7]) && r[7] > 1 && r[7] < 1100 ? r[7] : null,
    });
  }
  if (pts.length < 20 || pts[pts.length - 1].z - pts[0].z < 2000) return null;
  despike(pts, 't', 2.5);
  despike(pts, 'rh', 15);

  const withP = pts.filter((x) => x.p !== null).length;
  const measuredPressure = withP >= pts.length * 0.6;
  const levels: Level[] = [];
  if (measuredPressure) {
    let prev: { z: number; p: number } | null = null;
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i];
      let p: number;
      if (!prev) {
        if (x.p === null || Math.abs(x.p - isaPressure(x.z)) > isaPressure(x.z) * 0.15) continue;
        p = x.p;
      } else {
        const tv = (x.t ?? isaTemp(x.z)) + K0;
        const expected: number = prev.p * Math.exp((-G * (x.z - prev.z)) / (RD * tv));
        p = x.p === null || Math.abs(x.p - expected) > expected * 0.03 ? expected : x.p;
      }
      prev = { z: x.z, p };
      levels.push({ z: x.z, p, t: x.t, rh: x.rh, td: x.t !== null && x.rh !== null ? dewpoint(x.t, x.rh) : null });
    }
  } else {
    let p = isaPressure(pts[0].z);
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i];
      if (i > 0) {
        const a = pts[i - 1];
        const ta = (a.t ?? isaTemp(a.z)) + K0;
        const tb = (x.t ?? isaTemp(x.z)) + K0;
        const qa = a.t !== null && a.rh !== null ? (mixingRatio(p, dewpoint(a.t, a.rh) ?? -80) || 0) : 0;
        const tv = ((ta + tb) / 2) * (1 + 0.61 * qa);
        p *= Math.exp((-G * (x.z - a.z)) / (RD * tv));
      }
      levels.push({ z: x.z, p, t: x.t, rh: x.rh, td: x.t !== null && x.rh !== null ? dewpoint(x.t, x.rh) : null });
    }
  }
  if (levels.length < 20 || levels.filter((l) => l.t !== null).length < 10) return null;

  const winds = windProfile(sonde, levels);
  const { parcel, indices } = computeIndices(levels, winds);
  return { levels, measuredPressure, winds, parcel, indices };
}

export function atPressure(levels: Level[], p: number, key: 't' | 'td' | 'z' | 'rh'): number | null {
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i];
    const b = levels[i + 1];
    if (a.p >= p && b.p <= p) {
      const va = a[key];
      const vb = b[key];
      if (va === null || vb === null) return va ?? vb;
      const k = a.p === b.p ? 0 : (Math.log(a.p) - Math.log(p)) / (Math.log(a.p) - Math.log(b.p));
      return va + (vb - va) * k;
    }
  }
  return null;
}

export function pressureAtZ(levels: Level[], z: number): number | null {
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i];
    const b = levels[i + 1];
    if (a.z <= z && b.z >= z) {
      const k = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
      return Math.exp(Math.log(a.p) + (Math.log(b.p) - Math.log(a.p)) * k);
    }
  }
  return null;
}

export function windProfile(sonde: Sonde, levels?: Level[], layer = 250): WindLevel[] {
  const rows = ascent(sonde);
  if (rows.length < 10) return [];
  const out: WindLevel[] = [];
  let start = 0;
  const bin = (z: number) => Math.floor(z / layer);
  for (let i = 1; i <= rows.length; i++) {
    const done = i === rows.length || bin(rows[i][2]) !== bin(rows[start][2]);
    if (!done) continue;
    const a = rows[start];
    const b = rows[i - 1];
    start = i;
    const dt = (b[3] - a[3]) / 1000;
    if (dt < 20 || b[2] - a[2] < layer * 0.4) continue;
    const latM = (a[1] + b[1]) / 2;
    const dx = (b[0] - a[0]) * Math.cos((latM * Math.PI) / 180) * M_PER_DEG;
    const dy = (b[1] - a[1]) * M_PER_DEG;
    const u = dx / dt;
    const v = dy / dt;
    const speed = Math.hypot(u, v);
    if (speed > 150) continue;
    const z = (a[2] + b[2]) / 2;
    const dir = (((Math.atan2(-u, -v) * 180) / Math.PI) + 360) % 360;
    out.push({ z, p: levels ? pressureAtZ(levels, z) : null, u, v, speed, dir });
  }
  return out;
}

export function windAt(winds: WindLevel[], z: number): { u: number; v: number } | null {
  if (!winds.length || z < winds[0].z - 300 || z > winds[winds.length - 1].z + 300) return null;
  if (z <= winds[0].z) return winds[0];
  for (let i = 0; i < winds.length - 1; i++) {
    const a = winds[i];
    const b = winds[i + 1];
    if (a.z <= z && b.z >= z) {
      const k = (z - a.z) / (b.z - a.z);
      return { u: a.u + (b.u - a.u) * k, v: a.v + (b.v - a.v) * k };
    }
  }
  return winds[winds.length - 1];
}

function findTropopause(levels: Level[]): Indices['tropopause'] {
  const ok = levels.filter((l) => l.t !== null && l.p < 500);
  for (let i = 0; i < ok.length - 1; i++) {
    const a = ok[i];
    let j = i + 1;
    while (j < ok.length && ok[j].z - a.z < 300) j++;
    if (j >= ok.length) return null;
    const lapse = ((a.t as number) - (ok[j].t as number)) / ((ok[j].z - a.z) / 1000);
    if (lapse > 2) continue;
    let fine = true;
    let covered = false;
    for (let k = i + 1; k < ok.length && ok[k].z - a.z <= 2000; k++) {
      const avg = ((a.t as number) - (ok[k].t as number)) / ((ok[k].z - a.z) / 1000);
      if (ok[k].z - a.z >= 300 && avg > 2) fine = false;
      if (ok[k].z - a.z >= 1800) covered = true;
    }
    if (!covered) return null;
    if (fine) return { p: a.p, z: a.z, t: a.t as number };
  }
  return null;
}

function computeIndices(levels: Level[], winds: WindLevel[]): { parcel: { p: number; t: number }[]; indices: Indices } {
  const first = levels[0];
  const surfaceBased = first.z < 1500 && first.p > 820;
  const T = (p: number) => atPressure(levels, p, 't');
  const Td = (p: number) => atPressure(levels, p, 'td');

  const t850 = T(850);
  const td850 = Td(850);
  const t700 = T(700);
  const td700 = Td(700);
  const t500 = T(500);
  const k = t850 !== null && td850 !== null && t700 !== null && td700 !== null && t500 !== null && first.p >= 850 ? t850 - t500 + td850 - (t700 - td700) : null;
  const tt = t850 !== null && td850 !== null && t500 !== null && first.p >= 850 ? t850 + td850 - 2 * t500 : null;

  let freezing: number | null = null;
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i].t;
    const b = levels[i + 1].t;
    if (a !== null && b !== null && a >= 0 && b < 0) {
      freezing = levels[i].z + ((levels[i + 1].z - levels[i].z) * a) / (a - b);
      break;
    }
  }
  if (freezing === null && first.t !== null && first.t < 0 && surfaceBased) freezing = first.z;

  let pw: number | null = null;
  if (surfaceBased) {
    let sum = 0;
    let covered = 0;
    for (let i = 0; i < levels.length - 1 && levels[i].p > 300; i++) {
      const a = levels[i];
      const b = levels[i + 1];
      if (a.td === null || b.td === null) continue;
      const qa = mixingRatio(a.p, a.td);
      const qb = mixingRatio(b.p, b.td);
      sum += ((qa + qb) / 2) * (a.p - b.p) * 100;
      covered += a.p - b.p;
    }
    if (covered > (first.p - 300) * 0.8) pw = sum / G;
  }

  const tropopause = findTropopause(levels);

  const base = winds.find((w) => w.z <= first.z + 500) ?? winds[0];
  const shear = (dz: number) => {
    if (!surfaceBased || !base) return null;
    const top = windAt(winds, first.z + dz);
    return top ? Math.hypot(top.u - base.u, top.v - base.v) : null;
  };

  const empty: Indices = { cape: null, cin: null, li: null, k, tt, lcl: null, lfc: null, el: null, freezing, pw, tropopause, shear06: shear(6000), shear01: shear(1000), surfaceBased };

  const moist = levels.filter((l) => l.p >= first.p - 50 && l.t !== null && l.td !== null);
  if (!surfaceBased || first.t === null || moist.length < 3) return { parcel: [], indices: empty };

  const t0 = median(moist.map((l) => l.t as number));
  const td0 = Math.min(t0, median(moist.map((l) => l.td as number)));
  const p0 = first.p;
  const tK = t0 + K0;
  const tdK = td0 + K0;
  const tLcl = 1 / (1 / (tdK - 56) + Math.log(tK / tdK) / 800) + 56;
  const pLcl = p0 * Math.pow(tLcl / tK, 1 / KAPPA);
  const theta = tK * Math.pow(1000 / p0, KAPPA);
  const zLcl = (() => {
    for (let i = 0; i < levels.length - 1; i++) if (levels[i].p >= pLcl && levels[i + 1].p <= pLcl) return levels[i].z + ((levels[i + 1].z - levels[i].z) * (levels[i].p - pLcl)) / (levels[i].p - levels[i + 1].p);
    return first.z;
  })();

  const env = levels.filter((l) => l.t !== null);
  const moistTargets = env.filter((l) => l.p < pLcl).map((l) => l.p);
  const moistT = moistAdiabat(pLcl, tLcl - K0, [...moistTargets, 500]);
  const parcelAt = new Map<number, number>();
  moistTargets.forEach((p, i) => parcelAt.set(p, moistT[i]));
  const parcelT = (p: number) => (p >= pLcl ? dryAdiabat(theta, p) : (parcelAt.get(p) ?? null));

  const parcel = [{ p: p0, t: t0 }, { p: pLcl, t: tLcl - K0 }, ...moistTargets.filter((_, i) => i % 4 === 0).map((p) => ({ p, t: parcelAt.get(p) as number }))];

  let cape = 0;
  let cin = 0;
  let lfc: number | null = null;
  let el: number | null = null;
  for (let i = 0; i < env.length - 1; i++) {
    const a = env[i];
    const b = env[i + 1];
    const pa = parcelT(a.p);
    const pb = parcelT(b.p);
    if (pa === null || pb === null) continue;
    const buoy = (((pa - (a.t as number)) / ((a.t as number) + K0)) + ((pb - (b.t as number)) / ((b.t as number) + K0))) / 2;
    const e = G * buoy * (b.z - a.z);
    if (b.p > pLcl) {
      if (e < 0) cin += e;
      continue;
    }
    if (e > 0) {
      if (lfc === null) lfc = a.p;
      cape += e;
      el = b.p;
    } else if (lfc === null) cin += e;
    if (b.p < 100) break;
  }
  if (lfc === null) {
    cin = 0;
    el = null;
  }
  const li = t500 !== null && first.p > 500 ? t500 - (pLcl <= 500 ? dryAdiabat(theta, 500) : moistT[moistT.length - 1]) : null;

  return {
    parcel,
    indices: { ...empty, cape: lfc === null ? 0 : cape, cin: lfc === null ? null : cin, li, lcl: { p: pLcl, z: zLcl, t: tLcl - K0 }, lfc, el },
  };
}
