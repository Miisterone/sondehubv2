export type V3 = [number, number, number];
type V2 = [number, number];

export type ModelTone = 'body' | 'boom' | 'label' | 'dark' | 'accent';

export interface ModelFace {
  p: V3[];
  n: V3;
  tone: ModelTone;
}

export interface ModelPart {
  faces: ModelFace[];
  bias?: number;
}

export interface ModelWire {
  p: V3[];
  width: number;
  tone: 'line' | 'boom';
}

export interface SondeModel {
  parts: ModelPart[];
  wires: ModelWire[];
  yaw: number;
}

export type SondeKind = 'rs41' | 'rs92' | 'dfm' | 'dfm17' | 'm10' | 'm20' | 'imet' | 'generic';

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));

function newell(p: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit(n);
}

function centroid(p: V3[]): V3 {
  return mul(p.reduce(add, [0, 0, 0] as V3), 1 / p.length);
}

function roundRect(w: number, d: number, r: number, cx = 0, cy = 0, seg = 4): V2[] {
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.min(r, hw, hd);
  const corners: [number, number, number][] = [
    [hw - rr, hd - rr, 0],
    [-hw + rr, hd - rr, 90],
    [-hw + rr, -hd + rr, 180],
    [hw - rr, -hd + rr, 270],
  ];
  const out: V2[] = [];
  for (const [x, y, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180;
      out.push([cx + x + rr * Math.cos(a), cy + y + rr * Math.sin(a)]);
    }
  }
  return out;
}

function loft(rings: [z: number, ring: V2[]][], tone: ModelTone = 'body', bias = 0): ModelPart {
  const faces: ModelFace[] = [];
  const at = (z: number, r: V2[]): V3[] => r.map(([x, y]) => [x, y, z]);
  const levels = rings.map(([z, r]) => at(z, r));
  for (let k = 0; k < levels.length - 1; k++) {
    const a = levels[k];
    const b = levels[k + 1];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      const p: V3[] = [a[i], a[j], b[j], b[i]];
      const span = len(sub(a[j], a[i])) + len(sub(b[j], b[i]));
      if (span < 1e-6 && len(sub(b[i], a[i])) < 1e-6) continue;
      faces.push({ p, n: newell(p), tone });
    }
  }
  const top = levels[levels.length - 1];
  const bottom = [...levels[0]].reverse();
  faces.push({ p: top, n: newell(top), tone }, { p: bottom, n: newell(bottom), tone });
  return { faces, bias };
}

function slab(poly: V3[], d: V3, tone: ModelTone, bias = 0): ModelPart {
  const far = poly.map((v) => add(v, d));
  const c = centroid([...poly, ...far]);
  const faces: ModelFace[] = [];
  const push = (p: V3[]) => {
    let n = newell(p);
    if (dot(n, sub(centroid(p), c)) < 0) {
      p = [...p].reverse();
      n = mul(n, -1);
    }
    faces.push({ p, n, tone });
  };
  push(poly);
  push(far);
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    push([poly[i], poly[j], far[j], far[i]]);
  }
  return { faces, bias };
}

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tone: ModelTone = 'body', bias = 0): ModelPart {
  return slab(
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    [0, 0, z1 - z0],
    tone,
    bias,
  );
}

function strip(a: V3, b: V3, w: number, side: V3, tone: ModelTone = 'boom', bias = 0, t = 1.4): ModelPart {
  const s = mul(unit(side), w / 2);
  const n = mul(unit(cross(sub(b, a), side)), t);
  return slab([sub(a, s), add(a, s), add(b, s), sub(b, s)], n, tone, bias);
}

function loopBoom(a: V3, b: V3, w: number, side: V3, bias = 0): ModelPart[] {
  const s = unit(side);
  const rail = w * 0.28;
  const off = mul(s, (w - rail) / 2);
  const k = lerp(a, b, 0.7);
  const e = lerp(a, b, 0.93);
  return [
    strip(a, k, w, side, 'boom', bias, 1.4),
    strip(add(k, off), add(e, off), rail, side, 'boom', bias, 1.4),
    strip(sub(k, off), sub(e, off), rail, side, 'boom', bias, 1.4),
    strip(e, b, w, side, 'boom', bias, 1.4),
  ];
}

function forkBoom(a: V3, b: V3, w: number, side: V3, bias = 0): { parts: ModelPart[]; wires: ModelWire[] } {
  const s = unit(side);
  const k = lerp(a, b, 0.55);
  const f = lerp(a, b, 0.62);
  const spread = mul(s, w * 0.9);
  const prong = w * 0.32;
  const tipA = add(b, spread);
  const tipB = sub(b, spread);
  return {
    parts: [
      strip(a, f, w * 0.55, side, 'boom', bias, 1.4),
      strip(lerp(a, b, 0.38), k, w * 1.15, side, 'dark', bias + 0.4, 1.6),
      strip(add(f, mul(s, w * 0.2)), tipA, prong, side, 'boom', bias, 1.2),
      strip(sub(f, mul(s, w * 0.2)), tipB, prong, side, 'boom', bias, 1.2),
    ],
    wires: [{ p: [tipA, tipB], width: 0.5, tone: 'line' }],
  };
}

function decal(o: V3, u: V3, v: V3, tone: ModelTone, lift = 0.4): ModelPart {
  const n = mul(unit(cross(u, v)), lift);
  const p: V3[] = [add(o, n), add(add(o, u), n), add(add(add(o, u), v), n), add(add(o, v), n)];
  return { faces: [{ p, n: newell(p), tone }], bias: 1 };
}

const frontDecal = (y: number, x0: number, x1: number, z0: number, z1: number, tone: ModelTone = 'label') =>
  decal([x1, y, z0], [x0 - x1, 0, 0], [0, 0, z1 - z0], tone);
const rightDecal = (x: number, y0: number, y1: number, z0: number, z1: number, tone: ModelTone = 'label') =>
  decal([x, y0, z0], [0, y1 - y0, 0], [0, 0, z1 - z0], tone);

function antenna(from: V3, to: V3): ModelWire {
  return { p: [from, to], width: 0.7, tone: 'line' };
}

function rs41(): SondeModel {
  const body = loft([
    [0, roundRect(54, 38, 7)],
    [5, roundRect(62, 44, 8)],
    [128, roundRect(62, 44, 8)],
    [138, roundRect(52, 36, 6)],
  ]);
  const mount = box(-12, -20, 136, 12, -6, 150, 'body', 0.2);
  const boom = loopBoom([2, -13, 146], [74, -13, 246], 11, [-0.81, 0, 0.58], 0.5);
  return {
    yaw: 0,
    parts: [
      body,
      frontDecal(22, -24, 24, 22, 70),
      frontDecal(22, -24, 24, 62, 70, 'accent'),
      frontDecal(22, 10, 18, 32, 40, 'dark'),
      frontDecal(22, -18, -8, 32, 36, 'dark'),
      frontDecal(22, -18, -2, 42, 46, 'dark'),
      mount,
      ...boom,
    ],
    wires: [antenna([6, 8, 0], [6, 8, -52])],
  };
}

function rs92(): SondeModel {
  const body = loft([
    [0, roundRect(68, 62, 12)],
    [6, roundRect(76, 70, 14)],
    [112, roundRect(76, 70, 14)],
    [120, roundRect(68, 62, 12)],
    [125, roundRect(54, 48, 9)],
  ]);
  const post: V3 = [-6, 4, 125];
  const helix: ModelWire[] = [];
  const r = 17;
  const z0 = 140;
  const z1 = 205;
  for (let k = 0; k < 4; k++) {
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const a = ((k * 90 + t * 200) * Math.PI) / 180;
      pts.push([post[0] + r * Math.cos(a), post[1] + r * Math.sin(a), z0 + (z1 - z0) * t]);
    }
    for (let i = 0; i < pts.length - 1; i++) helix.push({ p: [pts[i], pts[i + 1]], width: 0.8, tone: 'boom' });
    helix.push({ p: [[post[0], post[1], z0], pts[0]], width: 0.8, tone: 'boom' });
    helix.push({ p: [pts[pts.length - 1], [post[0], post[1], z1]], width: 0.8, tone: 'boom' });
  }
  const mast = box(post[0] - 3, post[1] - 1, 125, post[0] + 3, post[1] + 1, z1 + 4, 'dark');
  const boom = loopBoom([20, -26, 122], [44, -26, 228], 11, [-0.98, 0, 0.22], -0.4);
  return {
    yaw: 0,
    parts: [
      body,
      frontDecal(35, -30, -2, 16, 38),
      frontDecal(35, 4, 30, 54, 58, 'accent'),
      mast,
      ...boom,
    ],
    wires: [...helix, antenna([-20, 10, 0], [-20, 10, -46])],
  };
}

function dfm(): SondeModel {
  const body = loft([
    [0, roundRect(102, 54, 8)],
    [5, roundRect(110, 60, 9)],
    [56, roundRect(110, 60, 9)],
    [56, roundRect(90, 56, 9)],
    [80, roundRect(90, 56, 9)],
    [86, roundRect(78, 46, 10)],
  ]);
  const boom = strip([-48, 0, 70], [-128, 0, 92], 10, [0, 0, 1], 'boom', 0.2);
  const cap = strip([-118, 0, 89], [-130, 0, 92.5], 12, [0, 0, 1], 'dark', 0.4);
  return {
    yaw: 0,
    parts: [
      body,
      frontDecal(30, 10, 46, 14, 46),
      frontDecal(30, 14, 16, 20, 34, 'dark'),
      frontDecal(30, 19, 20.5, 20, 34, 'dark'),
      frontDecal(30, 23, 26, 20, 34, 'dark'),
      frontDecal(30, 29, 30.5, 20, 34, 'dark'),
      frontDecal(30, 33, 36, 20, 34, 'dark'),
      boom,
      cap,
    ],
    wires: [antenna([0, 0, 0], [26, 30, -50])],
  };
}

function dfm17(): SondeModel {
  const body = loft([
    [0, roundRect(46, 42, 12)],
    [7, roundRect(58, 52, 13)],
    [82, roundRect(58, 52, 13)],
    [89, roundRect(50, 44, 10)],
  ]);
  const fin = slab(
    [
      [2, -14, 89],
      [2, 18, 89],
      [2, 8, 116],
      [2, -6, 116],
    ],
    [4, 0, 0],
    'body',
    0.3,
  );
  const boom: ModelPart[] = [
    strip([-14, -16, 86], [-14, -16, 150], 11, [1, 0, 0], 'boom', -0.6),
    strip([-17.5, -16, 150], [-17.5, -16, 182], 3.4, [1, 0, 0], 'boom', -0.6),
    strip([-10.5, -16, 150], [-10.5, -16, 182], 3.4, [1, 0, 0], 'boom', -0.6),
    strip([-14, -16, 182], [-14, -16, 190], 11, [1, 0, 0], 'boom', -0.6),
  ];
  return {
    yaw: 0,
    parts: [
      body,
      frontDecal(26, -22, 22, 30, 66),
      frontDecal(26, -16, -2, 38, 41, 'dark'),
      frontDecal(26, -16, 8, 45, 47, 'dark'),
      frontDecal(26, -16, 16, 51, 58, 'dark'),
      fin,
      ...boom,
    ],
    wires: [antenna([6, 4, 0], [6, 4, -44])],
  };
}

function m10(): SondeModel {
  const body = loft([
    [0, roundRect(72, 72, 14)],
    [5, roundRect(80, 80, 16)],
    [60, roundRect(80, 80, 16)],
    [68, roundRect(72, 72, 13)],
    [73, roundRect(58, 58, 9)],
  ]);
  const ridge = (x: number) =>
    loft(
      [
        [72, roundRect(12, 56, 4, x)],
        [79, roundRect(9, 52, 3, x)],
      ],
      'body',
      0.3,
    );
  const fork = forkBoom([-22, 22, 72], [-96, 46, 150], 9, [0.3, -0.95, 0], 0.6);
  return {
    yaw: 0,
    parts: [
      body,
      ridge(-14),
      ridge(14),
      frontDecal(40, -36, 36, 18, 40),
      frontDecal(40, -28, 8, 30, 36, 'dark'),
      frontDecal(40, -28, 18, 23, 26, 'accent'),
      ...fork.parts,
    ],
    wires: [...fork.wires, antenna([0, 0, 0], [0, 0, -48])],
  };
}

function m20(): SondeModel {
  const foot = (w: number, d: number, r: number) => roundRect(w, d, r);
  const body = loft([
    [0, foot(54, 82, 18)],
    [4, foot(64, 92, 22)],
    [22, foot(64, 92, 22)],
    [30, foot(56, 84, 19)],
    [34, foot(42, 70, 14)],
  ]);
  const hump = loft(
    [
      [33, roundRect(34, 30, 10, 0, -18)],
      [40, roundRect(30, 26, 9, 0, -18)],
      [43, roundRect(22, 18, 6, 0, -18)],
    ],
    'body',
    0.2,
  );
  const fork = forkBoom([4, -36, 32], [14, -96, 96], 8, [1, 0.2, 0], -0.2);
  return {
    yaw: 0,
    parts: [body, hump, rightDecal(32, -10, 30, 8, 22), rightDecal(32, -2, 20, 13, 17, 'dark'), ...fork.parts],
    wires: [...fork.wires, { p: [[0, 46, 12], [0, 76, 6], [4, 104, -6]], width: 0.7, tone: 'line' }],
  };
}

function imet(): SondeModel {
  const body = loft([
    [0, roundRect(54, 18, 4)],
    [4, roundRect(60, 22, 5)],
    [108, roundRect(60, 22, 5)],
    [114, roundRect(52, 20, 4)],
    [117, roundRect(40, 16, 3)],
  ]);
  const leds = [44, 54, 64, 74].map((z) => frontDecal(11, 14, 19, z, z + 4, 'dark'));
  const hook: ModelWire[] = [];
  const pts: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (Math.PI * i) / 8;
    pts.push([7 * Math.cos(a), 0, 117 + 9 * Math.sin(a)]);
  }
  for (let i = 0; i < pts.length - 1; i++) hook.push({ p: [pts[i], pts[i + 1]], width: 0.9, tone: 'line' });
  return {
    yaw: 0,
    parts: [
      body,
      frontDecal(11, -24, 8, 26, 84),
      frontDecal(11, -24, 8, 76, 84, 'accent'),
      ...leds,
      strip([-16, -2, 114], [-30, -2, 168], 10, [1, 0, 0.24], 'body', 0.4, 2.4),
    ],
    wires: [...hook, antenna([0, 0, 0], [0, 0, -48])],
  };
}

function generic(): SondeModel {
  const body = loft([
    [0, roundRect(54, 46, 8)],
    [5, roundRect(62, 52, 9)],
    [84, roundRect(62, 52, 9)],
    [90, roundRect(52, 42, 7)],
  ]);
  return {
    yaw: 0,
    parts: [body, frontDecal(26, -22, 22, 26, 60), strip([0, -8, 88], [40, -8, 150], 4, [-0.84, 0, 0.54], 'boom', 0.4)],
    wires: [antenna([0, 0, 0], [0, 0, -46])],
  };
}

const BUILDERS: Record<SondeKind, () => SondeModel> = {
  rs41,
  rs92,
  dfm,
  dfm17,
  m10,
  m20,
  imet,
  generic,
};

const cache = new Map<SondeKind, SondeModel>();

export function sondeModel(kind: SondeKind): SondeModel {
  let m = cache.get(kind);
  if (!m) {
    m = BUILDERS[kind]();
    cache.set(kind, m);
  }
  return m;
}

export function sondeKind(s: { type?: string | null; subtype?: string | null }): SondeKind {
  const id = [s.subtype, s.type].filter(Boolean).join('|').toUpperCase().replace(/[\s_]/g, '');
  if (id.includes('RS41')) return 'rs41';
  if (id.includes('RS92')) return 'rs92';
  if (/DFM-?17/.test(id)) return 'dfm17';
  if (id.includes('DFM')) return 'dfm';
  if (/(^|\|)M20/.test(id)) return 'm20';
  if (/(^|\|)M10/.test(id)) return 'm10';
  if (/IMET-?[14]\b/.test(id)) return 'imet';
  return 'generic';
}

function rotateZ([x, y, z]: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c, z];
}

const VIEW: V3 = [1, 1, 1];
const LIGHT: V3 = unit([0.35, 0.65, 1]);

const RAMPS: Record<ModelTone, [string, string, string, string]> = {
  body: ['a100', 'a200', 'a300', 'a500'],
  boom: ['a500', 'a700', 'a700', 'a900'],
  dark: ['a700', 'a900', 'a900', 'a900'],
  accent: ['a500', 'a500', 'a700', 'a700'],
  label: ['hi', 'hi', 'hi', 'hi'],
};

function shade(tone: ModelTone, n: V3): string {
  const b = dot(n, LIGHT);
  const step = RAMPS[tone][b >= 0.72 ? 0 : b >= 0.4 ? 1 : b >= 0.12 ? 2 : 3];
  return step === 'hi' ? '#ffffff' : `var(--i3-${step})`;
}

export type SondeDraw =
  | { kind: 'poly'; points: string; fill: string }
  | { kind: 'line'; d: string; stroke: string; width: number }
  | { kind: 'shadow'; cx: number; cy: number; rx: number; ry: number };

const drawCache = new Map<SondeKind, SondeDraw[]>();

export function drawSonde(kind: SondeKind): SondeDraw[] {
  const hit = drawCache.get(kind);
  if (hit) return hit;
  const m = sondeModel(kind);
  const px = ([x, y]: V3) => x - y;
  const py = ([x, y, z]: V3) => (x + y) / 2 - z;
  const parts = m.parts.map((p) => ({
    bias: p.bias ?? 0,
    faces: p.faces.map((f) => ({ tone: f.tone, p: f.p.map((v) => rotateZ(v, m.yaw)), n: rotateZ(f.n, m.yaw) })),
  }));
  const wires = m.wires.map((w) => ({ ...w, p: w.p.map((v) => rotateZ(v, m.yaw)) }));
  const fitPts = [...parts.flatMap((p) => p.faces.flatMap((f) => f.p)), ...wires.filter((w) => Math.min(...w.p.map((v) => v[2])) >= 0).flatMap((w) => w.p)];
  const xs = fitPts.map(px);
  const ys = fitPts.map(py);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(40 / (x1 - x0), 37 / (y1 - y0));
  const ox = 24 - ((x0 + x1) / 2) * s;
  const oy = 39.5 - y1 * s;
  const pt = (v: V3) => `${(ox + px(v) * s).toFixed(2)},${(oy + py(v) * s).toFixed(2)}`;

  const base = parts[0].faces.flatMap((f) => f.p).filter((v) => v[2] < 1e-6);
  const bx = base.map(px);
  const shadowW = (Math.max(...bx) - Math.min(...bx)) * s;

  type Item = { depth: number; draw: SondeDraw[] };
  const items: Item[] = [];
  for (const part of parts) {
    const shown = part.faces.filter((f) => dot(f.n, VIEW) > 0.02);
    if (!shown.length) continue;
    const all = part.faces.flatMap((f) => f.p);
    const c = centroid(all);
    const faces = shown
      .map((f) => ({ f, d: dot(centroid(f.p), VIEW) }))
      .sort((a, b) => a.d - b.d)
      .map(({ f }) => ({ kind: 'poly' as const, points: f.p.map(pt).join(' '), fill: shade(f.tone, f.n) }));
    items.push({ depth: dot(c, VIEW) + part.bias * 100, draw: faces });
  }
  for (const w of wires) {
    items.push({
      depth: dot(centroid(w.p), VIEW),
      draw: [{ kind: 'line', d: `M${w.p.map(pt).join('L')}`, stroke: w.tone === 'line' ? 'var(--i3-line)' : 'var(--i3-a500)', width: w.width }],
    });
  }
  items.sort((a, b) => a.depth - b.depth);
  const out: SondeDraw[] = [
    { kind: 'shadow', cx: Number((ox + px([0, 0, 0]) * s).toFixed(2)), cy: 44.5, rx: Number(Math.max(6, shadowW * 0.5).toFixed(2)), ry: 2.2 },
    ...items.flatMap((i) => i.draw),
  ];
  drawCache.set(kind, out);
  return out;
}
