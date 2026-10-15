import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { GeoBounds } from './atmo3d';

const SIZE = 1024;
const TIMEOUT_MS = 12_000;
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
const VEIL = { light: 'rgba(255,255,255,0.32)', dark: 'rgba(14,16,19,0.18)' } as const;

export interface FloorMap {
  canvas: HTMLCanvasElement;
  uv: (lat: number, lon: number) => [number, number];
}

const cache = new Map<string, Promise<FloorMap>>();
const styleCache = new Map<string, Promise<StyleSpecification>>();

const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.log(Math.tan(r) + 1 / Math.cos(r));
};

function style(theme: 'light' | 'dark'): Promise<StyleSpecification> {
  let p = styleCache.get(theme);
  if (!p) {
    p = fetch(STYLES[theme])
      .then((r) => r.json() as Promise<StyleSpecification>)
      .then((s) => ({ ...s, layers: s.layers.filter((l) => l.type !== 'symbol') }));
    p.catch(() => styleCache.delete(theme));
    styleCache.set(theme, p);
  }
  return p;
}

async function capture(b: GeoBounds, theme: 'light' | 'dark'): Promise<FloorMap> {
  const [{ Map: MlMap, setWorkerUrl }, { default: workerUrl }, spec] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    style(theme),
  ]);
  setWorkerUrl(workerUrl);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-${SIZE * 4}px;top:0;width:${SIZE}px;height:${SIZE}px;pointer-events:none;opacity:0`;
  document.body.append(host);
  const map = new MlMap({
    container: host,
    style: spec,
    bounds: [
      [b.west, b.south],
      [b.east, b.north],
    ],
    fitBoundsOptions: { padding: 0 },
    interactive: false,
    attributionControl: false,
    pixelRatio: 1,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('floor map timeout')), TIMEOUT_MS);
      map.once('idle', () => {
        window.clearTimeout(timer);
        resolve();
      });
      map.once('error', () => undefined);
    });
    const nw = map.project([b.west, b.north]);
    const se = map.project([b.east, b.south]);
    const src = map.getCanvas();
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(src, 0, 0);
    ctx.fillStyle = VEIL[theme];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx = src.width / SIZE;
    const sy = src.height / SIZE;
    const yN = mercY(b.north);
    const yS = mercY(b.south);
    const uv = (lat: number, lon: number): [number, number] => {
      const px = (nw.x + ((lon - b.west) / (b.east - b.west)) * (se.x - nw.x)) * sx;
      const py = (nw.y + ((yN - mercY(lat)) / (yN - yS)) * (se.y - nw.y)) * sy;
      return [px / canvas.width, 1 - py / canvas.height];
    };
    return { canvas, uv };
  } finally {
    map.remove();
    host.remove();
  }
}

export function loadFloorMap(b: GeoBounds, theme: 'light' | 'dark'): Promise<FloorMap> {
  const key = [b.north, b.south, b.west, b.east].map((v) => v.toFixed(4)).join(',') + `:${theme}`;
  let p = cache.get(key);
  if (!p) {
    p = capture(b, theme);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

export const FLOOR_ATTRIBUTION = '© OpenStreetMap, OpenFreeMap';
export const TERRAIN_ATTRIBUTION = '© Mapterhorn';
