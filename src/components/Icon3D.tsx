import type { ReactNode } from 'react';
import { cn } from 'cn';
import { isGlider } from '@/lib/sonde';
import type { FlightPhase, Sonde } from '@/lib/types';
import { GLIDER, turn, yawForHeading, type GliderPose, type GliderTone, type V3 } from '@/lib/gliderModel';

export type Icon3DId =
  | FlightPhase
  | `glider-${FlightPhase}`
  | 'burst'
  | 'landing'
  | 'station'
  | 'chase'
  | 'launch'
  | 'locate'
  | 'relief'
  | 'globe'
  | 'guide';

const HI = '#ffffff';

function Shadow({ rx = 8, ry = 2.2 }: { rx?: number; ry?: number }) {
  return <ellipse cx="24" cy="44.5" rx={rx} ry={ry} className="i3-shadow" />;
}

function Tile({ cy = 33, w = 18, d = 2.6 }: { cy?: number; w?: number; d?: number }) {
  const cx = 24;
  const top = `${cx},${cy - w / 2} ${cx + w},${cy} ${cx},${cy + w / 2} ${cx - w},${cy}`;
  const left = `${cx - w},${cy} ${cx},${cy + w / 2} ${cx},${cy + w / 2 + d} ${cx - w},${cy + d}`;
  const right = `${cx},${cy + w / 2} ${cx + w},${cy} ${cx + w},${cy + d} ${cx},${cy + w / 2 + d}`;
  return (
    <>
      <polygon points={left} className="i3-left" />
      <polygon points={right} className="i3-right" />
      <polygon points={top} className="i3-top" />
    </>
  );
}

function Cube({ cx, ty, w, h, tone = 'accent' }: { cx: number; ty: number; w: number; h: number; tone?: 'accent' | 'grey' | 'box' }) {
  const t = `${cx},${ty} ${cx + w},${ty + w / 2} ${cx},${ty + w} ${cx - w},${ty + w / 2}`;
  const l = `${cx - w},${ty + w / 2} ${cx},${ty + w} ${cx},${ty + w + h} ${cx - w},${ty + w / 2 + h}`;
  const r = `${cx},${ty + w} ${cx + w},${ty + w / 2} ${cx + w},${ty + w / 2 + h} ${cx},${ty + w + h}`;
  const cls =
    tone === 'grey' ? ['i3-grey-top', 'i3-grey-left', 'i3-grey-right'] : tone === 'box' ? ['i3-box', 'i3-left', 'i3-right'] : ['i3-a300', 'i3-a500', 'i3-a700'];
  return (
    <>
      <polygon points={l} className={cls[1]} />
      <polygon points={r} className={cls[2]} />
      <polygon points={t} className={cls[0]} />
    </>
  );
}

function Sphere({ cx, cy, r, grey, children }: { cx: number; cy: number; r: number; grey?: boolean; children?: ReactNode }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const p1 = [cx + r * Math.cos(rad(-62)), cy + r * Math.sin(rad(-62))].map((v) => v.toFixed(2));
  const p2 = [cx + r * Math.cos(rad(152)), cy + r * Math.sin(rad(152))].map((v) => v.toFixed(2));
  const ri = (r * 1.35).toFixed(2);
  const hx = cx - r * 0.42;
  const hy = cy - r * 0.45;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} className={grey ? 'i3-grey-lit' : 'i3-a100'} />
      <path d={`M${p1[0]} ${p1[1]}A${r} ${r} 0 0 1 ${p2[0]} ${p2[1]}A${ri} ${ri} 0 0 0 ${p1[0]} ${p1[1]}Z`} className={grey ? 'i3-grey-shade' : 'i3-a300'} />
      {children}
      <ellipse cx={hx} cy={hy} rx={r * 0.24} ry={r * 0.15} transform={`rotate(-38 ${hx} ${hy})`} fill={HI} />
    </>
  );
}

function Question({ dx = 0, dy = 0 }: { dx?: number; dy?: number }) {
  return (
    <g transform={dx || dy ? `translate(${dx} ${dy})` : undefined}>
      <path d="M21.4 13.2c0-1.6 1.2-2.6 2.6-2.6s2.6 1 2.6 2.4c0 1.9-2.6 2.1-2.6 4" fill="none" className="i3-line" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="24" cy="20.4" r="1.1" className="i3-line-fill" />
    </g>
  );
}

function Balloon({ grey }: { grey?: boolean }) {
  return (
    <>
      <Shadow />
      <Sphere cx={24} cy={16} r={11.5} grey={grey} />
      <polygon points="22.2,27.1 25.8,27.1 24,29.4" className={grey ? 'i3-grey-shade' : 'i3-a300'} />
      <path d="M24 29.4v2.6" className="i3-line" strokeWidth="1.1" strokeLinecap="round" />
      <Cube cx={24} ty={31.6} w={4.6} h={4.4} tone={grey ? 'grey' : 'accent'} />
      {grey && <Question />}
    </>
  );
}

const GLIDER_TONES: Record<'accent' | 'grey', Record<Exclude<GliderTone, 'shine'>, [string, string, string]>> = {
  accent: { body: ['i3-a200', 'i3-a300', 'i3-a500'], glass: ['i3-a700', 'i3-a900', 'i3-a900'] },
  grey: { body: ['i3-grey-top', 'i3-grey-shade', 'i3-grey-left'], glass: ['i3-grey-right', 'i3-grey-right', 'i3-grey-right'] },
};

function gliderShape(pose: GliderPose, scale: number, cy: number, { grey, ground }: { grey?: boolean; ground?: boolean } = {}): ReactNode {
  const faces = GLIDER.map((f) => ({ tone: f.tone, p: f.p.map((v) => turn(v, pose)), n: turn(f.n, pose) }));
  const all = faces.flatMap((f) => f.p);
  const px = ([x, y]: V3) => (x - y) * scale;
  const py = ([x, y, z]: V3) => ((x + y) / 2 - z) * scale;
  const xs = all.map(px);
  const ys = all.map(py);
  const zmin = Math.min(...all.map((v) => v[2]));
  const ox = 24 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const oy = ground ? cy + zmin * scale : cy - (Math.min(...ys) + Math.max(...ys)) / 2;
  const pt = (v: V3) => `${(ox + px(v)).toFixed(2)},${(oy + py(v)).toFixed(2)}`;
  const tones = GLIDER_TONES[grey ? 'grey' : 'accent'];
  const fill = (tone: Exclude<GliderTone, 'shine'>, [x, y, z]: V3) => tones[tone][z >= x && z >= y ? 0 : y >= x ? 1 : 2];
  const shown = faces
    .filter((f) => f.n[0] + f.n[1] + f.n[2] > 0.02 && !(grey && f.tone === 'shine'))
    .map((f) => ({ ...f, depth: f.p.reduce((s, v) => s + v[0] + v[1] + v[2], 0) / f.p.length + (f.tone === 'shine' ? 0.5 : 0) }))
    .sort((a, b) => a.depth - b.depth);
  const wheel = turn([4, 0, 0], pose);
  return (
    <>
      {ground && <ellipse cx={(ox + px(wheel)).toFixed(2)} cy={(oy + py([wheel[0], wheel[1], zmin])).toFixed(2)} rx="7.5" ry="3.75" className="i3-a100" />}
      {shown.map((f, i) =>
        f.tone === 'shine' ? (
          <polygon key={i} points={f.p.map(pt).join(' ')} fill={HI} />
        ) : (
          <polygon key={i} points={f.p.map(pt).join(' ')} className={fill(f.tone, f.n)} />
        ),
      )}
    </>
  );
}

const GLIDER_YAW: Record<FlightPhase, number> = { ascending: -110, descending: 20, landed: 20, lost: 20 };

const GLIDER_ART: Record<FlightPhase, (yaw: number) => ReactNode> = {
  ascending: (yaw) => (
    <>
      <Shadow rx={10} />
      {gliderShape({ yaw, pitch: 14, roll: 0 }, 0.88, 22)}
    </>
  ),
  descending: (yaw) => (
    <>
      <Shadow rx={10} />
      {gliderShape({ yaw, pitch: -12, roll: 0 }, 0.88, 22)}
    </>
  ),
  landed: (yaw) => (
    <>
      <Tile cy={35} w={17} />
      {gliderShape({ yaw, pitch: 0, roll: -9 }, 0.72, 35, { ground: true })}
    </>
  ),
  lost: (yaw) => (
    <>
      <Shadow rx={10} />
      {gliderShape({ yaw, pitch: 0, roll: 0 }, 0.88, 24, { grey: true })}
      <Question dx={12} dy={-8.4} />
    </>
  ),
};

const HEADING_STEP = 10;
const gliderCache = new Map<string, ReactNode>();

function glider(phase: FlightPhase, heading?: number): ReactNode {
  const step = heading === undefined ? null : ((Math.round(heading / HEADING_STEP) * HEADING_STEP) % 360 + 360) % 360;
  const key = `${phase}:${step ?? ''}`;
  let art = gliderCache.get(key);
  if (art === undefined) {
    art = GLIDER_ART[phase](step === null ? GLIDER_YAW[phase] : yawForHeading(step));
    gliderCache.set(key, art);
  }
  return art;
}

function Parachute() {
  return (
    <>
      <Shadow />
      <path d="M8.5 16.5C8.5 8.5 15.4 4 24 4s15.5 4.5 15.5 12.5Z" className="i3-a100" />
      <path d="M24 4C19.6 6 17.4 11 16.6 16.5h-4.4C13 10.4 17.4 5.6 24 4Z" className="i3-a300" />
      <path d="M24 4c2.6 2.4 3.6 7.2 3.8 12.5h7.4C34.3 10.2 30.4 5.4 24 4Z" className="i3-a300" />
      <ellipse cx="24" cy="16.5" rx="15.5" ry="2.2" className="i3-a500" />
      <path d="M10 17.6 22.4 31M38 17.6 25.6 31M17.5 18.6l5.4 12.4M30.5 18.6 25.1 31" className="i3-line" strokeWidth="0.9" strokeLinecap="round" />
      <Cube cx={24} ty={30.4} w={4.6} h={4.4} />
    </>
  );
}

const ARROW = '21.6,4 26.4,4 26.4,10 29.6,10 24,16.2 18.4,10 21.6,10';

function Landed() {
  return (
    <>
      <Tile />
      <ellipse cx="24" cy="33" rx="9" ry="4.5" className="i3-a100" />
      <Cube cx={24} ty={22.4} w={6.4} h={5.6} />
      <polygon points={ARROW} className="i3-a700" transform="translate(1.4 0.8)" />
      <polygon points={ARROW} className="i3-a500" />
    </>
  );
}

function star(cx: number, cy: number, ro: number, ri: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = ((-90 + i * 22.5) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function Burst() {
  return (
    <>
      <Shadow rx={9} ry={2.5} />
      <polygon points={star(24, 23.6, 15, 7.4)} className="i3-a700" />
      <polygon points={star(24, 21, 15, 7.4)} className="i3-a300" />
      <polygon points={star(24, 21, 8.6, 4.4)} className="i3-a100" />
      <circle cx="24" cy="21" r="2.8" fill={HI} />
    </>
  );
}

function Pin() {
  return (
    <>
      <path d="M24 32.6c-1.2-3.4-6.6-8.2-6.6-13.4a6.6 6.6 0 0 1 13.2 0c0 5.2-5.4 10-6.6 13.4Z" className="i3-a700" />
      <path d="M24 32.6c-1.2-3.4-6.6-8.2-6.6-13.4A6.6 6.6 0 0 1 24 12.6Z" className="i3-a500" />
      <circle cx="24" cy="19.2" r="2.5" fill={HI} />
    </>
  );
}

function Landing() {
  return (
    <>
      <Tile />
      <ellipse cx="24" cy="33" rx="13" ry="6.5" className="i3-a100" />
      <ellipse cx="24" cy="33" rx="8.6" ry="4.3" className="i3-paper" />
      <ellipse cx="24" cy="33" rx="4.4" ry="2.2" className="i3-a300" />
      <Pin />
    </>
  );
}

function Locate() {
  return (
    <>
      <Tile />
      <ellipse cx="24" cy="33" rx="14" ry="7" fill="none" className="i3-stroke-a300" strokeWidth="0.8" strokeDasharray="1.6 1.6" />
      <ellipse cx="24" cy="33" rx="8.5" ry="4.25" className="i3-a100" />
      <Pin />
      <Sphere cx={39} cy={8.5} r={4} />
      <path d="M39 12.5v2" className="i3-line" strokeWidth="0.6" strokeLinecap="round" />
      <Cube cx={39} ty={14.4} w={1.6} h={1.5} />
      <path d="M37.6 19.6c-1 2.8-3 5.6-5.6 7.8" fill="none" className="i3-stroke-a300" strokeWidth="0.8" strokeDasharray="1.2 1.4" strokeLinecap="round" />
    </>
  );
}

function Station() {
  return (
    <>
      <Tile cy={35} w={13} />
      <Cube cx={24} ty={25.4} w={6} h={5.4} tone="box" />
      <path d="M24 31V12.5" className="i3-stroke-a700" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.2 7.6a9.4 9.4 0 0 0 0 10.2M30.8 7.6a9.4 9.4 0 0 1 0 10.2" fill="none" className="i3-stroke-a300" strokeWidth="2" strokeLinecap="round" />
      <path d="M20.4 9.6a5.4 5.4 0 0 0 0 6.2M27.6 9.6a5.4 5.4 0 0 1 0 6.2" fill="none" className="i3-stroke-a500" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="12.6" r="2.4" className="i3-a500" />
    </>
  );
}

function Chase() {
  return (
    <>
      <Shadow rx={15} ry={4.2} />
      <g transform="translate(0.5 3.5)">
        <polygon points="11,18.5 27,26.5 27,32.5 11,24.5" className="i3-a500" />
        <polygon points="27,26.5 36,22 36,28 27,32.5" className="i3-a700" />
        <polygon points="20,14 36,22 27,26.5 11,18.5" className="i3-a300" />
        <polygon points="13.5,13.1 21.5,17.1 21.5,21.6 13.5,17.6" className="i3-a100" />
        <polygon points="21.5,17.1 28.5,13.6 28.5,18.1 21.5,21.6" className="i3-a300" />
        <polygon points="20.5,9.6 28.5,13.6 21.5,17.1 13.5,13.1" className="i3-a50" />
        <ellipse cx="15.2" cy="26.4" rx="2.1" ry="2.5" transform="rotate(26.6 15.2 26.4)" className="i3-a900" />
        <ellipse cx="23.4" cy="30.5" rx="2.1" ry="2.5" transform="rotate(26.6 23.4 30.5)" className="i3-a900" />
        <ellipse cx="33.4" cy="29.2" rx="1.7" ry="2.3" transform="rotate(-26.6 33.4 29.2)" className="i3-a900" />
      </g>
    </>
  );
}

function Launch() {
  return (
    <>
      <Tile cy={36} w={14} d={2.4} />
      <ellipse cx="24" cy="36" rx="5" ry="2.5" className="i3-shadow" />
      <Sphere cx={24} cy={12.5} r={8} />
      <polygon points="22.8,20.3 25.2,20.3 24,21.9" className="i3-a300" />
      <path d="M24 21.9v2.4" className="i3-line" strokeWidth="1" strokeLinecap="round" />
      <Cube cx={24} ty={24.2} w={3.4} h={3.2} />
    </>
  );
}

function Relief() {
  return (
    <>
      <Tile cy={34} w={19} />
      <polygon points="31,15 24,30.5 31.5,34.5" className="i3-a300" />
      <polygon points="31,15 31.5,34.5 40,31" className="i3-a500" />
      <polygon points="20,9 8,31.5 21,37.5" className="i3-a100" />
      <polygon points="20,9 21,37.5 33,31" className="i3-a500" />
      <polygon points="20,9 16.8,15 18.6,15.9 20.3,16.6" fill={HI} />
      <polygon points="20,9 20.3,16.6 23.2,15" className="i3-a50" />
    </>
  );
}

function Globe() {
  return (
    <>
      <Shadow rx={7} ry={2} />
      <Sphere cx={24} cy={19} r={13}>
        <ellipse cx="24" cy="19" rx="13" ry="4.4" fill="none" className="i3-stroke-a500" strokeWidth="0.9" />
        <path d="M13.2 11.8h21.6M13.2 26.2h21.6" fill="none" className="i3-stroke-a300" strokeWidth="0.9" />
        <ellipse cx="24" cy="19" rx="5.4" ry="13" fill="none" className="i3-stroke-a500" strokeWidth="0.9" />
        <path d="M24 6v26" className="i3-stroke-a300" strokeWidth="0.9" />
      </Sphere>
      <path d="M24 32v4" className="i3-line" strokeWidth="1.2" strokeLinecap="round" />
      <Cube cx={24} ty={35.6} w={6.4} h={2.6} />
    </>
  );
}

function Guide() {
  return (
    <>
      <Tile cy={35} w={18} />
      <polygon points="21.4,9.6 26.6,9.6 34.5,35 13.5,35" className="i3-a100" opacity={0.75} />
      <ellipse cx="24" cy="35" rx="10.5" ry="5.25" className="i3-paper" />
      <ellipse cx="24" cy="35" rx="10.5" ry="5.25" fill="none" className="i3-stroke-a300" strokeWidth="0.8" />
      <Cube cx={24} ty={27.6} w={4.6} h={4.2} />
      <path d="M24 2.5v3" className="i3-line" strokeWidth="1.1" strokeLinecap="round" />
      <polygon points="19.6,5.4 28.4,5.4 26.8,10.4 21.2,10.4" className="i3-a500" />
      <polygon points="24,5.4 28.4,5.4 26.8,10.4 24,10.4" className="i3-a700" />
      <ellipse cx="24" cy="10.4" rx="2.8" ry="0.9" fill={HI} />
    </>
  );
}

const ART: Record<Icon3DId, (heading?: number) => ReactNode> = {
  ascending: () => <Balloon />,
  descending: () => <Parachute />,
  landed: () => <Landed />,
  lost: () => <Balloon grey />,
  burst: () => <Burst />,
  landing: () => <Landing />,
  station: () => <Station />,
  chase: () => <Chase />,
  launch: () => <Launch />,
  locate: () => <Locate />,
  relief: () => <Relief />,
  'glider-ascending': (heading) => glider('ascending', heading),
  'glider-descending': (heading) => glider('descending', heading),
  'glider-landed': (heading) => glider('landed', heading),
  'glider-lost': (heading) => glider('lost', heading),
  globe: () => <Globe />,
  guide: () => <Guide />,
};

interface Icon3DProps {
  id: Icon3DId;
  size?: number;
  className?: string;
  title?: string;
  heading?: number;
}

export function Icon3D({ id, size = 40, className, title, heading }: Icon3DProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn('inline-block shrink-0 select-none', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {ART[id](heading)}
    </svg>
  );
}

export function SondeIcon3D({
  sonde,
  phase = sonde.phase,
  ...props
}: Omit<Icon3DProps, 'id'> & { sonde: Pick<Sonde, 'phase' | 'type' | 'subtype' | 'last'>; phase?: FlightPhase }) {
  return <Icon3D id={isGlider(sonde) ? `glider-${phase}` : phase} {...props} />;
}

export function AltitudeColumn({ alt, burst, label, className }: { alt: number; burst: number | null; label: string; className?: string }) {
  const top = Math.max(40000, (burst ?? 0) * 1.08, alt * 1.08);
  const w = 56;
  const h = 104;
  const cx = w / 2;
  const hw = 14;
  const base = h - 10;
  const k = (base - 18) / top;
  const y = (m: number) => base - Math.max(0, Math.min(top, m)) * k;
  const yt = y(top);
  const face = (side: 'l' | 'r') =>
    side === 'l'
      ? `${cx - hw},${yt} ${cx},${yt + hw / 2} ${cx},${base + hw / 2} ${cx - hw},${base}`
      : `${cx},${yt + hw / 2} ${cx + hw},${yt} ${cx + hw},${base} ${cx},${base + hw / 2}`;
  const ring = (m: number) => {
    const v = y(m);
    return `M${cx - hw} ${v.toFixed(1)} L${cx} ${(v + hw / 2).toFixed(1)} L${cx + hw} ${v.toFixed(1)}`;
  };
  const ya = y(alt);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} className={cn('shrink-0', className)}>
      <ellipse cx={cx} cy={base + 3} rx={hw + 2} ry={(hw + 2) / 2.2} className="i3-shadow" />
      <polygon points={face('l')} className="i3-a100" />
      <polygon points={face('r')} className="i3-a200" />
      <polygon points={`${cx},${yt - hw / 2} ${cx + hw},${yt} ${cx},${yt + hw / 2} ${cx - hw},${yt}`} className="i3-a50" />
      {burst !== null && <path d={ring(burst)} fill="none" className="i3-stroke-a700" strokeWidth="1" strokeDasharray="2 2" />}
      <path d={ring(alt)} fill="none" className="i3-stroke-a500" strokeWidth="2" />
      <circle cx={cx} cy={ya + hw / 2} r="3.2" className="i3-a500 i3-ring" strokeWidth="1.5" />
    </svg>
  );
}
