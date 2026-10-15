export type V3 = [number, number, number];
export type GliderTone = 'body' | 'glass' | 'shine';

export interface GliderFace {
  p: V3[];
  n: V3;
  tone: GliderTone;
}

export interface GliderPose {
  yaw: number;
  pitch: number;
  roll: number;
}

const FUSELAGE: [x: number, top: number, bottom: number, half: number][] = [
  [11.6, 0.2, -0.7, 0.6],
  [9.6, 1.25, -1.9, 1.5],
  [6.2, 2, -2.3, 1.8],
  [2.6, 1.9, -2, 1.65],
  [-1, 1.25, -1.2, 1.1],
  [-5.2, 0.8, -0.55, 0.62],
  [-11.6, 0.6, -0.05, 0.38],
];

const mirror = ([x, y, z]: V3): V3 => [x, -y, z];

function slab(top: V3[], depth: number[], out: GliderFace[]) {
  const bottom = top.map(([x, y, z], i): V3 => [x, y, z - depth[i]]);
  out.push({ p: top, n: [0, 0, 1], tone: 'body' }, { p: [...bottom].reverse(), n: [0, 0, -1], tone: 'body' });
  top.forEach((a, i) => {
    const j = (i + 1) % top.length;
    const b = top[j];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push({ p: [a, b, bottom[j], bottom[i]], n: [(b[1] - a[1]) / len, (a[0] - b[0]) / len, 0], tone: 'body' });
  });
}

function pair(top: V3[], depth: number[], out: GliderFace[]) {
  slab(top, depth, out);
  slab(top.map(mirror).reverse(), [...depth].reverse(), out);
}

function gliderModel(): GliderFace[] {
  const f: GliderFace[] = [];
  for (let i = 0; i < FUSELAGE.length - 1; i++) {
    const [x0, t0, b0, w0] = FUSELAGE[i];
    const [x1, t1, b1, w1] = FUSELAGE[i + 1];
    f.push(
      { p: [[x0, -w0, t0], [x0, w0, t0], [x1, w1, t1], [x1, -w1, t1]], n: [0, 0, 1], tone: 'body' },
      { p: [[x0, w0, t0], [x0, w0, b0], [x1, w1, b1], [x1, w1, t1]], n: [0, 1, 0], tone: 'body' },
      { p: [[x0, -w0, t0], [x1, -w1, t1], [x1, -w1, b1], [x0, -w0, b0]], n: [0, -1, 0], tone: 'body' },
      { p: [[x0, -w0, b0], [x1, -w1, b1], [x1, w1, b1], [x0, w0, b0]], n: [0, 0, -1], tone: 'body' },
    );
  }
  const [xn, tn, bn, wn] = FUSELAGE[0];
  const [xt, tt, bt, wt] = FUSELAGE[FUSELAGE.length - 1];
  f.push(
    { p: [[xn, -wn, tn], [xn, -wn, bn], [xn, wn, bn], [xn, wn, tn]], n: [1, 0, 0], tone: 'body' },
    { p: [[xt, wt, tt], [xt, wt, bt], [xt, -wt, bt], [xt, -wt, tt]], n: [-1, 0, 0], tone: 'body' },
  );

  const a: V3 = [9.4, 1.25, 1.35];
  const b: V3 = [7.4, 1, 2.95];
  const c: V3 = [5, 1, 2.75];
  const d: V3 = [3.8, 1.55, 1.95];
  f.push(
    { p: [mirror(a), a, b, mirror(b)], n: [0.62, 0, 0.78], tone: 'glass' },
    { p: [mirror(b), b, c, mirror(c)], n: [0, 0, 1], tone: 'glass' },
    { p: [mirror(c), c, d, mirror(d)], n: [-0.55, 0, 0.83], tone: 'glass' },
    { p: [a, d, c, b], n: [0, 1, 0.25], tone: 'glass' },
    { p: [mirror(a), mirror(b), mirror(c), mirror(d)], n: [0, -1, 0.25], tone: 'glass' },
    { p: [[7.1, -0.55, 3], [7.1, 0.25, 3], [5.6, 0.25, 2.85], [5.6, -0.55, 2.85]], n: [0, 0, 1], tone: 'shine' },
  );

  const span = 18.5;
  const tip = 1.55 + span * Math.tan((3 * Math.PI) / 180);
  pair([[4.4, 1.7, 1.55], [3, span, tip], [1.1, span, tip], [0, 1.7, 1.55]], [1, 0.45, 0.45, 1], f);

  const fin = (y: number): V3[] => [[-6.6, y, 0.75], [-9.6, y, 7], [-12.2, y, 7], [-12, y, 0.6]];
  f.push(
    { p: fin(0.25), n: [0, 1, 0], tone: 'body' },
    { p: fin(-0.25).reverse(), n: [0, -1, 0], tone: 'body' },
    { p: [[-6.6, -0.25, 0.75], [-6.6, 0.25, 0.75], [-9.6, 0.25, 7], [-9.6, -0.25, 7]], n: [0.9, 0, 0.43], tone: 'body' },
  );
  pair([[-9.3, 0, 7.45], [-10.5, 6, 7.45], [-12, 6, 7.45], [-12.4, 0, 7.45]], [0.45, 0.45, 0.45, 0.45], f);
  return f;
}

export const GLIDER = gliderModel();

export function turn([x, y, z]: V3, { yaw, pitch, roll }: GliderPose): V3 {
  const r = Math.PI / 180;
  const [cp, sp] = [Math.cos(pitch * r), Math.sin(pitch * r)];
  [x, z] = [x * cp - z * sp, x * sp + z * cp];
  const [cr, sr] = [Math.cos(roll * r), Math.sin(roll * r)];
  [y, z] = [y * cr - z * sr, y * sr + z * cr];
  const [cy, sy] = [Math.cos(yaw * r), Math.sin(yaw * r)];
  [x, y] = [x * cy - y * sy, x * sy + y * cy];
  return [x, y, z];
}

export function yawForHeading(heading: number): number {
  const r = (heading * Math.PI) / 180;
  const u = Math.sin(r);
  const v = -Math.cos(r);
  return (Math.atan2((2 * v - u) / 2, (u + 2 * v) / 2) * 180) / Math.PI;
}
