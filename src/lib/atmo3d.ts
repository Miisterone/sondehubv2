import type { FlightData, Sounding } from './flight';
import type { Profile } from './atmo';
import type { FlightPhase } from './types';
import { cloudLayers } from './insights';

const M_PER_DEG = 111_195;
const MAX_MEASURED = 900;
const MAX_FORECAST = 300;
const MIN_SPAN = 8_000;
const OZONE: [number, number] = [20_000, 30_000];

export const SIDE = 10;
export const HEIGHT = 9;

export type Vec3 = [number, number, number];

export interface Band {
  id: 'troposphere' | 'stratosphere' | 'ozone' | 'cloud';
  from: number;
  to: number;
  label: string;
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
  center: [number, number];
  span: number;
  top: number;
  tropopause: { z: number; measured: boolean };
  freezing: number | null;
  clouds: [number, number][];
  bands: Band[];
  ticks: number[];
  origin: [number, number];
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
  const span = Math.max(MIN_SPAN, maxX - minX, maxY - minY) * 1.25;

  const measuredTropo = profile?.indices.tropopause?.z ?? null;
  const tropopause = measuredTropo !== null ? { z: measuredTropo, measured: true } : { z: typicalTropopause(lat0), measured: false };
  const top = Math.max(15_000, Math.ceil((Math.max(maxZ, tropopause.z + 3_000) + 1_500) / 5_000) * 5_000);

  const clouds = (cloudLayers(sounding) ?? []).filter(([a, b]) => b > a && a < top);
  const bands: Band[] = [
    { id: 'troposphere', from: 0, to: tropopause.z, label: 'Troposphère' },
    { id: 'stratosphere', from: tropopause.z, to: top, label: 'Stratosphère' },
  ];
  if (top >= OZONE[0] + 4_000 && OZONE[0] > tropopause.z) bands.push({ id: 'ozone', from: OZONE[0], to: Math.min(OZONE[1], top), label: 'Couche d’ozone' });
  for (const [a, b] of clouds) bands.push({ id: 'cloud', from: Math.max(0, a), to: Math.min(top, b), label: 'Nuages' });

  const tickStep = top > 30_000 ? 10_000 : 5_000;
  const ticks: number[] = [];
  for (let z = 0; z <= top; z += tickStep) ticks.push(z);

  return {
    measured,
    measuredIdx,
    forecast,
    launch: at(0, d.alt[0]),
    current: at(d.last, d.alt[d.last]),
    currentIndex: d.last,
    burst: d.burst !== null ? at(d.burst, d.alt[d.burst]) : null,
    burstP: d.burstP !== null ? at(d.burstP, d.altP[d.burstP]) : null,
    landingP: d.landingP !== null ? at(d.landingP, 0) : null,
    airborneStart: (d.alt[0] ?? 0) >= 3_000,
    center: [(minX + maxX) / 2, (minY + maxY) / 2],
    span,
    top,
    tropopause,
    freezing: profile?.indices.freezing ?? null,
    clouds,
    bands,
    ticks,
    origin: [lat0, lon0],
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

export function whereabouts(alt: number, scene: AtmoScene, phase: FlightPhase, fmt: (m: number) => string): Whereabouts {
  const tropo = scene.tropopause.z;
  const inCloud = scene.clouds.some(([a, b]) => alt >= a && alt <= b);
  if (phase === 'landed' || alt < 150) {
    const top = scene.burst?.[2] ?? Math.max(...scene.measured.map((p) => p[2]));
    return { layer: 'sol', caption: 'au sol', amount: fmt(top), relation: top > tropo ? 'atteints dans la stratosphère' : 'altitude maximale' };
  }
  const verb = phase === 'descending' ? 'redescend dans la ' : phase === 'ascending' ? 'monte dans la ' : 'dans la ';
  if (alt < tropo) {
    return {
      layer: 'troposphère',
      caption: `${verb}troposphère${inCloud ? ', dans un nuage' : ''}`,
      amount: fmt(tropo - alt),
      relation: phase === 'ascending' ? 'avant la tropopause' : 'sous la tropopause',
    };
  }
  return { layer: 'stratosphère', caption: `${verb}stratosphère`, amount: fmt(alt - tropo), relation: 'au-dessus de la tropopause' };
}

export function exaggeration(scene: AtmoScene): number {
  return HEIGHT / scene.top / (SIDE / scene.span);
}
