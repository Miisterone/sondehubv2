import type { GeoBounds } from './atmo3d';

const TILE = 512;
const MAX_ZOOM = 12;
const MIN_ZOOM = 4;
const MAX_TILES_ACROSS = 3;

export interface TerrainGrid {
  n: number;
  data: Float32Array;
  max: number;
  maxAt: [number, number];
}

const cache = new Map<string, Promise<TerrainGrid>>();

function mercX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z * TILE;
}

function mercY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * TILE;
}

async function tile(z: number, x: number, y: number): Promise<Float32Array | null> {
  try {
    const res = await fetch(`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, TILE, TILE);
    bmp.close();
    const px = ctx.getImageData(0, 0, TILE, TILE).data;
    const out = new Float32Array(TILE * TILE);
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
    return out;
  } catch {
    return null;
  }
}

async function build(b: GeoBounds, n: number): Promise<TerrainGrid> {
  let z = MAX_ZOOM;
  while (z > MIN_ZOOM && (mercX(b.east, z) - mercX(b.west, z)) / TILE > MAX_TILES_ACROSS) z--;
  const x0 = Math.floor(mercX(b.west, z) / TILE);
  const x1 = Math.floor(mercX(b.east, z) / TILE);
  const y0 = Math.floor(mercY(b.north, z) / TILE);
  const y1 = Math.floor(mercY(b.south, z) / TILE);
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const jobs: Promise<Float32Array | null>[] = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) jobs.push(tile(z, tx, ty));
  const tiles = await Promise.all(jobs);
  if (tiles.every((t) => t === null)) throw new Error('terrain unavailable');

  const sample = (px: number, py: number) => {
    const tx = Math.min(cols - 1, Math.max(0, Math.floor(px / TILE)));
    const ty = Math.min(rows - 1, Math.max(0, Math.floor(py / TILE)));
    const t = tiles[ty * cols + tx];
    if (!t) return 0;
    const lx = Math.min(TILE - 1, Math.max(0, Math.floor(px - tx * TILE)));
    const ly = Math.min(TILE - 1, Math.max(0, Math.floor(py - ty * TILE)));
    return t[ly * TILE + lx];
  };

  const data = new Float32Array(n * n);
  let max = 0;
  let maxAt: [number, number] = [0, 0];
  for (let j = 0; j < n; j++) {
    const lat = b.north - (j / (n - 1)) * (b.north - b.south);
    const py = mercY(lat, z) - y0 * TILE;
    for (let i = 0; i < n; i++) {
      const lon = b.west + (i / (n - 1)) * (b.east - b.west);
      const px = mercX(lon, z) - x0 * TILE;
      const fx = px - Math.floor(px);
      const fy = py - Math.floor(py);
      const bx = Math.floor(px);
      const by = Math.floor(py);
      const v =
        sample(bx, by) * (1 - fx) * (1 - fy) + sample(bx + 1, by) * fx * (1 - fy) + sample(bx, by + 1) * (1 - fx) * fy + sample(bx + 1, by + 1) * fx * fy;
      const e = Math.max(0, v);
      data[j * n + i] = e;
      if (e > max) {
        max = e;
        maxAt = [i, j];
      }
    }
  }
  return { n, data, max, maxAt };
}

export function loadTerrain(b: GeoBounds, n = 192): Promise<TerrainGrid> {
  const key = [b.north, b.south, b.west, b.east].map((v) => v.toFixed(4)).join(',') + `:${n}`;
  let p = cache.get(key);
  if (!p) {
    p = build(b, n);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

export function elevationAt(g: TerrainGrid, u: number, v: number): number {
  const i = Math.min(g.n - 1.001, Math.max(0, u * (g.n - 1)));
  const j = Math.min(g.n - 1.001, Math.max(0, v * (g.n - 1)));
  const i0 = Math.floor(i);
  const j0 = Math.floor(j);
  const a = i - i0;
  const c = j - j0;
  const d = g.data;
  const n = g.n;
  return d[j0 * n + i0] * (1 - a) * (1 - c) + d[j0 * n + i0 + 1] * a * (1 - c) + d[(j0 + 1) * n + i0] * (1 - a) * c + d[(j0 + 1) * n + i0 + 1] * a * c;
}
