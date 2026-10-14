import type { Map as MlMap } from 'maplibre-gl';
import type { FlightPhase } from './types';
import { t } from '@/i18n';

export const PHASE_COLOUR: Record<FlightPhase, string> = {
  ascending: '#38bdf8',
  descending: '#fbbf24',
  landed: '#34d399',
  lost: '#94a3b8',
};

export const PHASE_LABEL: Record<FlightPhase, string> = {
  get ascending() {
    return t('lib.phase.ascending');
  },
  get descending() {
    return t('lib.phase.descending');
  },
  get landed() {
    return t('lib.phase.landed');
  },
  get lost() {
    return t('lib.phase.lost');
  },
};

export const COLOURS = {
  listener: '#a78bfa',
  chase: '#f472b6',
  site: '#2dd4bf',
  landing: '#fb7185',
  burst: '#fb923c',
  recovered: '#4ade80',
  unrecovered: '#facc15',
  me: '#3b82f6',
};

const PR = 2; // render icons at 2x for crisp HiDPI display

type Draw = (ctx: CanvasRenderingContext2D, s: number) => void;

function canvasFor(size: number, draw: Draw): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size * PR;
  const ctx = c.getContext('2d')!;
  ctx.scale(PR, PR);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  draw(ctx, size);
  return c;
}

function halo(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
}

// --- Sonde icons ---------------------------------------------------------------
// Illustrated style: white latex envelope with soft grey shading and a dark outline,
// a thin string, and a payload box tinted with the flight-phase colour.

const OUTLINE = '#2b3445';

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Teardrop envelope: wide round top tapering to a neck at `neckY`. */
function envelopePath(ctx: CanvasRenderingContext2D, s: number, neckY: number) {
  const cx = s / 2;
  ctx.beginPath();
  ctx.moveTo(cx, neckY);
  ctx.bezierCurveTo(s * 0.33, neckY - s * 0.11, s * 0.13, s * 0.42, s * 0.13, s * 0.27);
  ctx.bezierCurveTo(s * 0.13, s * 0.12, s * 0.3, s * 0.035, cx, s * 0.035);
  ctx.bezierCurveTo(s * 0.7, s * 0.035, s * 0.87, s * 0.12, s * 0.87, s * 0.27);
  ctx.bezierCurveTo(s * 0.87, s * 0.42, s * 0.67, neckY - s * 0.11, cx, neckY);
  ctx.closePath();
}

/** Latex-like radial shading, lit from the upper left. */
function envelopeFill(ctx: CanvasRenderingContext2D, s: number, tones: [string, string, string]) {
  const g = ctx.createRadialGradient(s * 0.38, s * 0.2, s * 0.02, s * 0.5, s * 0.3, s * 0.42);
  g.addColorStop(0, tones[0]);
  g.addColorStop(0.55, tones[1]);
  g.addColorStop(1, tones[2]);
  return g;
}

/** Small rounded payload box with a lit top face, like a radiosonde housing. */
function payload(ctx: CanvasRenderingContext2D, s: number, colour: string, top: number, w = 0.34, h = 0.17) {
  const x = s * (0.5 - w / 2);
  const y = s * top;
  const bw = s * w;
  const bh = s * h;
  const g = ctx.createLinearGradient(0, y, 0, y + bh);
  g.addColorStop(0, shade(colour, 0.25));
  g.addColorStop(1, shade(colour, -0.3));
  ctx.fillStyle = g;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, s * 0.035);
  ctx.fill();
  ctx.stroke();
  // lit top face
  ctx.fillStyle = shade(colour, 0.6);
  ctx.beginPath();
  ctx.ellipse(s / 2, y + bh * 0.22, bw * 0.38, bh * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

function softShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
}
function noShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
}

/** Ascending: inflated weather balloon carrying its payload. */
const balloon =
  (colour: string, lost = false): Draw =>
  (ctx, s) => {
    const cx = s / 2;
    const neck = s * 0.62;
    softShadow(ctx);
    envelopePath(ctx, s, neck);
    ctx.fillStyle = envelopeFill(ctx, s, lost ? ['#e5e7eb', '#b8bec8', '#7c8594'] : ['#ffffff', '#eef0f4', '#a9b0bd']);
    ctx.fill();
    noShadow(ctx);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // neck knot
    ctx.fillStyle = lost ? '#9aa1ad' : '#d6dae2';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.035, neck + s * 0.035);
    ctx.lineTo(cx + s * 0.035, neck + s * 0.035);
    ctx.lineTo(cx, neck - s * 0.01);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // string
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx, neck + s * 0.035);
    ctx.lineTo(cx, s * 0.78);
    ctx.stroke();
    payload(ctx, s, colour, 0.78);
    if (lost) {
      ctx.fillStyle = '#3b4252';
      ctx.font = `800 ${Math.round(s * 0.3)}px Inter Variable, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, s * 0.3);
    }
  };

/** Descending: the balloon has burst, the payload hangs under its parachute. */
const parachute =
  (colour: string): Draw =>
  (ctx, s) => {
    const cx = s / 2;
    const rim = s * 0.4;
    softShadow(ctx);
    ctx.beginPath();
    ctx.moveTo(s * 0.1, rim);
    ctx.bezierCurveTo(s * 0.1, s * 0.02, s * 0.9, s * 0.02, s * 0.9, rim);
    // scalloped skirt
    for (let i = 3; i >= 0; i--) {
      const x0 = s * (0.1 + 0.2 * (i + 1));
      const x1 = s * (0.1 + 0.2 * i);
      ctx.quadraticCurveTo((x0 + x1) / 2, rim - s * 0.07, x1, rim);
    }
    ctx.closePath();
    ctx.fillStyle = envelopeFill(ctx, s, ['#ffffff', '#eef0f4', '#a9b0bd']);
    ctx.fill();
    noShadow(ctx);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // gores
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const x of [0.3, 0.5, 0.7]) {
      ctx.moveTo(s * x, rim - s * 0.03);
      ctx.quadraticCurveTo(s * (0.5 + (x - 0.5) * 0.6), s * 0.12, cx, s * 0.11);
    }
    ctx.stroke();
    // suspension lines
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const x of [0.12, 0.36, 0.64, 0.88]) {
      ctx.moveTo(s * x, rim);
      ctx.lineTo(cx + (x - 0.5) * s * 0.18, s * 0.77);
    }
    ctx.stroke();
    payload(ctx, s, colour, 0.77);
  };

/** On the ground: deflated envelope lying flat, payload standing next to it. */
const landed =
  (colour: string): Draw =>
  (ctx, s) => {
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.86, s * 0.44, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    // envelope lying on its side, flattened
    ctx.save();
    ctx.translate(s * 0.4, s * 0.64);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(0.62, 1);
    ctx.translate(-s * 0.5, -s * 0.36);
    softShadow(ctx);
    envelopePath(ctx, s, s * 0.66);
    ctx.fillStyle = envelopeFill(ctx, s, ['#ffffff', '#eceff3', '#a9b0bd']);
    ctx.fill();
    noShadow(ctx);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // wrinkles of the deflated latex
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s * 0.32, s * 0.2);
    ctx.quadraticCurveTo(s * 0.45, s * 0.32, s * 0.4, s * 0.48);
    ctx.moveTo(s * 0.62, s * 0.16);
    ctx.quadraticCurveTo(s * 0.58, s * 0.32, s * 0.64, s * 0.44);
    ctx.stroke();
    ctx.restore();
    // string from the neck to the payload
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(s * 0.62, s * 0.63);
    ctx.quadraticCurveTo(s * 0.68, s * 0.6, s * 0.72, s * 0.66);
    ctx.stroke();
    // payload upright on the ground
    ctx.save();
    ctx.translate(s * 0.22, 0);
    payload(ctx, s, colour, 0.64, 0.34, 0.2);
    ctx.restore();
  };

/** Predicted landing: crosshair target. */
const target = (fill: string): Draw => (ctx, s) => {
  const cx = s / 2;
  halo(ctx);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(cx, cx, s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = fill;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cx, s * 0.3, 0, Math.PI * 2);
  ctx.moveTo(cx, s * 0.05);
  ctx.lineTo(cx, s * 0.32);
  ctx.moveTo(cx, s * 0.68);
  ctx.lineTo(cx, s * 0.95);
  ctx.moveTo(s * 0.05, cx);
  ctx.lineTo(s * 0.32, cx);
  ctx.moveTo(s * 0.68, cx);
  ctx.lineTo(s * 0.95, cx);
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cx, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
};

/** Burst point: eight-point star. */
const burst = (fill: string): Draw => (ctx, s) => {
  const cx = s / 2;
  halo(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? s * 0.45 : s * 0.2;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    ctx.lineTo(cx + r * Math.cos(a), cx + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

/** Receiving station: mast with radio waves. */
const antenna = (fill: string): Draw => (ctx, s) => {
  const cx = s / 2;
  halo(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cx, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.42);
  ctx.lineTo(s * 0.36, s * 0.76);
  ctx.moveTo(cx, s * 0.42);
  ctx.lineTo(s * 0.64, s * 0.76);
  ctx.moveTo(s * 0.4, s * 0.62);
  ctx.lineTo(s * 0.6, s * 0.62);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, s * 0.4, s * 0.12, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, s * 0.4, s * 0.22, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, s * 0.4, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
};

/** Chase car: rounded car silhouette in a badge. */
const car = (fill: string): Draw => (ctx, s) => {
  const cx = s / 2;
  halo(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cx, s * 0.44, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(s * 0.22, s * 0.6);
  ctx.lineTo(s * 0.22, s * 0.5);
  ctx.lineTo(s * 0.32, s * 0.47);
  ctx.lineTo(s * 0.4, s * 0.34);
  ctx.lineTo(s * 0.62, s * 0.34);
  ctx.lineTo(s * 0.7, s * 0.47);
  ctx.lineTo(s * 0.78, s * 0.5);
  ctx.lineTo(s * 0.78, s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(s * 0.33, s * 0.62, s * 0.07, 0, Math.PI * 2);
  ctx.arc(s * 0.67, s * 0.62, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s * 0.33, s * 0.62, s * 0.035, 0, Math.PI * 2);
  ctx.arc(s * 0.67, s * 0.62, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
};

/** Launch site: rounded square with an upward arrow. */
const site = (fill: string): Draw => (ctx, s) => {
  halo(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(s * 0.12, s * 0.12, s * 0.76, s * 0.76, s * 0.18);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.7);
  ctx.lineTo(s * 0.5, s * 0.3);
  ctx.moveTo(s * 0.34, s * 0.45);
  ctx.lineTo(s * 0.5, s * 0.29);
  ctx.lineTo(s * 0.66, s * 0.45);
  ctx.stroke();
};

/** Recovery report: check mark (recovered) or question mark (not found). */
const recovery = (fill: string, ok: boolean): Draw => (ctx, s) => {
  const cx = s / 2;
  halo(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cx, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#0b1220';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(s * 0.3, s * 0.52);
    ctx.lineTo(s * 0.45, s * 0.66);
    ctx.lineTo(s * 0.71, s * 0.36);
  } else {
    ctx.moveTo(s * 0.35, s * 0.36);
    ctx.lineTo(s * 0.65, s * 0.66);
    ctx.moveTo(s * 0.65, s * 0.36);
    ctx.lineTo(s * 0.35, s * 0.66);
  }
  ctx.stroke();
};

/** Direction-of-travel chevron, rotated on the map by the sonde heading. */
const heading = (fill: string): Draw => (ctx, s) => {
  const cx = s / 2;
  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.12);
  ctx.lineTo(s * 0.85, s * 0.82);
  ctx.lineTo(cx, s * 0.62);
  ctx.lineTo(s * 0.15, s * 0.82);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
};

/** Every icon used on the map, also rendered as images for the UI so both always match. */
export const ICONS = {
  'sonde-ascending': [34, balloon(PHASE_COLOUR.ascending)],
  'sonde-descending': [32, parachute(PHASE_COLOUR.descending)],
  'sonde-landed': [30, landed(PHASE_COLOUR.landed)],
  'sonde-lost': [32, balloon(PHASE_COLOUR.lost, true)],
  'heading-ascending': [16, heading(PHASE_COLOUR.ascending)],
  'heading-descending': [16, heading(PHASE_COLOUR.descending)],
  landing: [24, target(COLOURS.landing)],
  'landing-small': [16, target(COLOURS.landing)],
  burst: [20, burst(COLOURS.burst)],
  listener: [18, antenna(COLOURS.listener)],
  chase: [22, car(COLOURS.chase)],
  site: [16, site(COLOURS.site)],
  'recovery-ok': [18, recovery(COLOURS.recovered, true)],
  'recovery-ko': [18, recovery(COLOURS.unrecovered, false)],
} satisfies Record<string, [number, Draw]>;

export type IconId = keyof typeof ICONS;

export function addIcons(map: MlMap) {
  for (const [id, [size, draw]] of Object.entries(ICONS)) {
    if (map.hasImage(id)) continue;
    const c = canvasFor(size, draw);
    map.addImage(id, c.getContext('2d')!.getImageData(0, 0, c.width, c.height), { pixelRatio: PR });
  }
}

const urlCache = new Map<IconId, string>();
/** PNG data URL of a map icon, for use in <img> tags. */
export function iconUrl(id: IconId): string {
  let url = urlCache.get(id);
  if (!url) {
    const [size, draw] = ICONS[id];
    url = canvasFor(size, draw).toDataURL('image/png');
    urlCache.set(id, url);
  }
  return url;
}
