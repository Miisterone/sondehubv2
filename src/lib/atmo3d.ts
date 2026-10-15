import type { FlightData, Sounding } from './flight';
import type { Profile } from './atmo';
import type { FlightPhase } from './types';
import { cloudLayers } from './insights';
import { t, type TKey } from '@/i18n';

const M_PER_DEG = 111_195;
const MAX_MEASURED = 900;
const MAX_FORECAST = 300;
const MIN_SPAN = 8_000;
const OZONE: [number, number] = [20_000, 30_000];

export const SIDE = 10;
export const HEIGHT = 9;

export type Vec3 = [number, number, number];

export type AtmoView = 'persp' | 'profile' | 'top';

export interface AtmoOptions {
  terrain: boolean;
  map: boolean;
  wallShadow: boolean;
  dropLines: boolean;
}

export interface Band {
  id: 'troposphere' | 'stratosphere' | 'ozone' | 'cloud';
  from: number;
  to: number;
  label: string;
}

export interface GeoBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

export interface Crossing {
  t: number;
  p: Vec3;
}

export interface AtmoScene {
  measured: Vec3[];
  measuredIdx: number[];
  forecast: Vec3[];
  launch: Vec3;
  current: Vec3;
  currentIndex: number;
  burst: Vec3 | null;
  burstP: Vec3 | null;
  landingP: Vec3 | null;
  airborneStart: boolean;
  glider: boolean;
  center: [number, number];
  span: number;
  top: number;
  tropopause: { z: number; measured: boolean };
  freezing: number | null;
  clouds: [number, number][];
  bands: Band[];
  ticks: number[];
  origin: [number, number];
  bounds: GeoBounds;
  crossing: Crossing | null;
  times: { launch: number; now: number; burst: number | null; burstPredicted: number | null; landing: number | null };
  landingAlt: number | null;
}

function typicalTropopause(lat: number): number {
  const a = Math.abs(lat);
  return a < 30 ? 16_000 : a < 60 ? 11_000 : 9_000;
}

function sampled(from: number, to: number, max: number, keep: (number | null)[]): number[] {
  const out: number[] = [];
  if (to < from) return out;
  const step = Math.max(1, Math.ceil((to - from + 1) / max));
  const must = new Set(keep.filter((k): k is number => k !== null && k >= from && k <= to));
  for (let i = from; i <= to; i++) if ((i - from) % step === 0 || i === to || must.has(i)) out.push(i);
  return out;
}

export function buildAtmoScene(d: FlightData, sounding: Sounding, profile: Profile | null): AtmoScene | null {
  if (d.last < 1) return null;
  const lat0 = d.lat[0];
  const lon0 = d.lon[0];
  const kx = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG;
  const at = (i: number, alt: number | null): Vec3 => [(d.lon[i] - lon0) * kx, (d.lat[i] - lat0) * M_PER_DEG, Math.max(0, alt ?? 0)];

  const measuredIdx = sampled(0, d.last, MAX_MEASURED, [d.burst]);
  const measured = measuredIdx.map((i) => at(i, d.alt[i]));
  const forecast = d.forecast ? sampled(d.last, d.x.length - 1, MAX_FORECAST, [d.burstP]).map((i) => at(i, i === d.last ? d.alt[i] : d.altP[i])) : [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxZ = 0;
  for (const p of [...measured, ...forecast]) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
    maxZ = Math.max(maxZ, p[2]);
  }
  const rawSpan = Math.max(MIN_SPAN, maxX - minX, maxY - minY) * 1.25;
  const baseSpan = MIN_SPAN * 1.25;
  const span = baseSpan * Math.pow(1.2, Math.max(0, Math.ceil(Math.log(rawSpan / baseSpan) / Math.log(1.2) - 1e-9)));
  const snap = span / 8;

  const measuredTropo = profile?.indices.tropopause?.z ?? null;
  const tropopause = measuredTropo !== null ? { z: measuredTropo, measured: true } : { z: typicalTropopause(lat0), measured: false };
  const top = Math.max(15_000, Math.ceil((Math.max(maxZ, tropopause.z + 3_000) + 1_500) / 5_000) * 5_000);

  const clouds = (cloudLayers(sounding) ?? []).filter(([a, b]) => b > a && a < top);
  const bands: Band[] = [
    {
      id: 'troposphere',
      from: 0,
      to: tropopause.z,
      get label() {
        return t('atmo3d.layer.troposphere');
      },
    },
    {
      id: 'stratosphere',
      from: tropopause.z,
      to: top,
      get label() {
        return t('atmo3d.layer.stratosphere');
      },
    },
  ];
  if (top >= OZONE[0] + 4_000 && OZONE[0] > tropopause.z)
    bands.push({
      id: 'ozone',
      from: OZONE[0],
      to: Math.min(OZONE[1], top),
      get label() {
        return t('atmo3d.layer.ozone');
      },
    });
  for (const [a, b] of clouds)
    bands.push({
      id: 'cloud',
      from: Math.max(0, a),
      to: Math.min(top, b),
      get label() {
        return t('atmo3d.layer.clouds');
      },
    });

  const tickStep = top > 30_000 ? 10_000 : 5_000;
  const ticks: number[] = [];
  for (let z = 0; z <= top; z += tickStep) ticks.push(z);

  const center: [number, number] = [Math.round((minX + maxX) / 2 / snap) * snap, Math.round((minY + maxY) / 2 / snap) * snap];
  const bounds: GeoBounds = {
    north: lat0 + (center[1] + span / 2) / M_PER_DEG,
    south: lat0 + (center[1] - span / 2) / M_PER_DEG,
    west: lon0 + (center[0] - span / 2) / kx,
    east: lon0 + (center[0] + span / 2) / kx,
  };

  let crossing: Crossing | null = null;
  const ascentEnd = d.burst ?? d.last;
  for (let i = 1; i <= ascentEnd; i++) {
    const a = d.alt[i - 1];
    const b = d.alt[i];
    if (a === null || b === null || a >= tropopause.z || b < tropopause.z) continue;
    const k = (tropopause.z - a) / (b - a || 1);
    const pa = at(i - 1, a);
    const pb = at(i, b);
    crossing = { t: d.x[i - 1] + (d.x[i] - d.x[i - 1]) * k, p: [pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k, tropopause.z] };
    break;
  }

  return {
    measured,
    measuredIdx,
    forecast,
    launch: at(0, d.alt[0]),
    current: at(d.last, d.alt[d.last]),
    currentIndex: d.last,
    burst: d.burst !== null ? at(d.burst, d.alt[d.burst]) : null,
    burstP: d.burstP !== null ? at(d.burstP, d.altP[d.burstP]) : null,
    landingP: d.landingP !== null ? at(d.landingP, d.altP[d.landingP]) : null,
    airborneStart: (d.alt[0] ?? 0) >= 3_000,
    glider: d.glider,
    center,
    span,
    top,
    tropopause,
    freezing: profile?.indices.freezing ?? null,
    clouds,
    bands,
    ticks,
    origin: [lat0, lon0],
    bounds,
    crossing,
    times: {
      launch: d.x[0],
      now: d.x[d.last],
      burst: d.burst !== null ? d.x[d.burst] : null,
      burstPredicted: d.burstP !== null ? d.x[d.burstP] : null,
      landing: d.landingP !== null ? d.x[d.landingP] : null,
    },
    landingAlt: d.landingP !== null ? (d.altP[d.landingP] ?? null) : null,
  };
}

export function positionAt(d: FlightData, scene: AtmoScene, i: number): Vec3 {
  const kx = Math.cos((scene.origin[0] * Math.PI) / 180) * M_PER_DEG;
  return [(d.lon[i] - scene.origin[1]) * kx, (d.lat[i] - scene.origin[0]) * M_PER_DEG, Math.max(0, d.alt[i] ?? 0)];
}

export interface Whereabouts {
  layer: 'troposphère' | 'stratosphère' | 'sol';
  caption: string;
  amount: string | null;
  relation: string | null;
}

type Motion = 'ascending' | 'descending' | 'inside';

const CAPTION: Record<'troposphere' | 'stratosphere', Record<Motion, TKey>> = {
  troposphere: { ascending: 'atmo3d.where.troposphere.ascending', descending: 'atmo3d.where.troposphere.descending', inside: 'atmo3d.where.troposphere.inside' },
  stratosphere: { ascending: 'atmo3d.where.stratosphere.ascending', descending: 'atmo3d.where.stratosphere.descending', inside: 'atmo3d.where.stratosphere.inside' },
};

const CAPTION_CLOUD: Record<Motion, TKey> = {
  ascending: 'atmo3d.where.troposphere.ascendingInCloud',
  descending: 'atmo3d.where.troposphere.descendingInCloud',
  inside: 'atmo3d.where.troposphere.insideInCloud',
};

export function whereabouts(alt: number, scene: AtmoScene, phase: FlightPhase, fmt: (m: number) => string): Whereabouts {
  const tropo = scene.tropopause.z;
  const inCloud = scene.clouds.some(([a, b]) => alt >= a && alt <= b);
  if (phase === 'landed' || alt < 150) {
    const top = scene.burst?.[2] ?? Math.max(...scene.measured.map((p) => p[2]));
    return { layer: 'sol', caption: t('atmo3d.where.ground'), amount: fmt(top), relation: top > tropo ? t('atmo3d.where.reachedInStratosphere') : t('atmo3d.where.maxAltitude') };
  }
  const motion: Motion = phase === 'descending' ? 'descending' : phase === 'ascending' ? 'ascending' : 'inside';
  if (alt < tropo) {
    return {
      layer: 'troposphère',
      caption: t(inCloud ? CAPTION_CLOUD[motion] : CAPTION.troposphere[motion]),
      amount: fmt(tropo - alt),
      relation: phase === 'ascending' ? t('atmo3d.where.beforeTropopause') : t('atmo3d.where.belowTropopause'),
    };
  }
  return { layer: 'stratosphère', caption: t(CAPTION.stratosphere[motion]), amount: fmt(alt - tropo), relation: t('atmo3d.where.aboveTropopause') };
}

export function exaggeration(scene: AtmoScene): number {
  return HEIGHT / scene.top / (SIDE / scene.span);
}
