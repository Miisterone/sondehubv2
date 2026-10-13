import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { FlightData } from '@/lib/flight';
import { fmtAltShort, fmtClock, fmtDist, relative, type Units } from '@/lib/format';
import { bearing, distance, towards } from '@/lib/geo';
import { useStore } from '@/store/useStore';
import { chartTheme } from '@/lib/chartTheme';
import { LineKey, Readout } from './ChartParts';

const M_PER_DEG = 111_195;
const SCALES = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000];
const MAX_POINTS = 600;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setW(node.clientWidth);
    const ro = new ResizeObserver(() => setW(node.clientWidth));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

type Label = { x: number; y: number; text: string; anchor: 'start' | 'end' };

export function GroundTrack({ d, units, now, live, height = 250 }: { d: FlightData; units: Units; now: number; live: boolean; height?: number }) {
  const [ref, width] = useWidth();
  const theme = useStore((s) => s.settings.theme);
  const t = chartTheme(theme);
  const [hover, setHover] = useState<number | null>(null);
  const timer = useRef(0);

  const geo = useMemo(() => {
    if (width === 0 || d.x.length < 2) return null;
    const lat0 = d.lat[0];
    const lon0 = d.lon[0];
    const kx = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG;
    const mx = d.lon.map((v) => (v - lon0) * kx);
    const my = d.lat.map((v) => (v - lat0) * M_PER_DEG);
    let minX = Math.min(...mx);
    let maxX = Math.max(...mx);
    let minY = Math.min(...my);
    let maxY = Math.max(...my);
    const minSpan = 2_000;
    if (maxX - minX < minSpan) {
      const c = (maxX + minX) / 2;
      minX = c - minSpan / 2;
      maxX = c + minSpan / 2;
    }
    if (maxY - minY < minSpan) {
      const c = (maxY + minY) / 2;
      minY = c - minSpan / 2;
      maxY = c + minSpan / 2;
    }
    const padX = 24;
    const padTop = 22;
    const padBottom = 36;
    const s = Math.min((width - 2 * padX) / (maxX - minX), (height - padTop - padBottom) / (maxY - minY));
    const offX = (width - 2 * padX - (maxX - minX) * s) / 2;
    const offY = (height - padTop - padBottom - (maxY - minY) * s) / 2;
    const sx = mx.map((v) => padX + offX + (v - minX) * s);
    const sy = my.map((v) => height - padBottom - offY - (v - minY) * s);

    const keep = new Set<number>([0, d.last]);
    if (d.burst !== null) keep.add(d.burst);
    if (d.burstP !== null) keep.add(d.burstP);
    if (d.landingP !== null) keep.add(d.landingP);
    const stepM = Math.max(1, Math.ceil((d.last + 1) / MAX_POINTS));
    const measured: number[] = [];
    for (let i = 0; i <= d.last; i++) if (i % stepM === 0 || keep.has(i)) measured.push(i);
    const forecast: number[] = [];
    const nF = d.x.length - d.last;
    const stepF = Math.max(1, Math.ceil(nF / MAX_POINTS));
    for (let i = d.last; i < d.x.length; i++) if ((i - d.last) % stepF === 0 || keep.has(i)) forecast.push(i);

    const toPath = (idx: number[]) => idx.map((i, k) => `${k ? 'L' : 'M'}${sx[i].toFixed(1)},${sy[i].toFixed(1)}`).join('');
    const target = (width - 2 * padX) / 4;
    const metres = [...SCALES].reverse().find((m) => m * s <= target) ?? SCALES[0];
    return { sx, sy, measured, forecast, mPath: toPath(measured), fPath: d.forecast ? toPath(forecast) : '', scaleM: metres, scalePx: metres * s };
  }, [d, width, height]);

  const i = hover ?? d.last;
  const fromLaunch = d.x.length ? distance(d.lat[0], d.lon[0], d.lat[i], d.lon[i]) : 0;
  const dir = fromLaunch > 200 ? towards(bearing(d.lat[0], d.lon[0], d.lat[i], d.lon[i])) : null;
  const predicted = i > d.last;
  const alt = predicted ? d.altP[i] : d.alt[i];

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let best = -1;
    let bestD = Infinity;
    for (const list of [geo.measured, geo.forecast]) {
      for (const j of list) {
        const dd = (geo.sx[j] - px) ** 2 + (geo.sy[j] - py) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = j;
        }
      }
    }
    window.clearTimeout(timer.current);
    setHover(best >= 0 && bestD < 44 ** 2 ? best : null);
  };
  const leave = (e: PointerEvent<SVGSVGElement>) => {
    window.clearTimeout(timer.current);
    if (e.pointerType === 'mouse') setHover(null);
    else timer.current = window.setTimeout(() => setHover(null), 2500);
  };

  const labels: Label[] = [];
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const addLabel = (j: number, text: string, prefer: 'start' | 'end' = 'start') => {
    if (!geo) return;
    const w = text.length * 6.4;
    const h = 14;
    const x = geo.sx[j];
    const y = geo.sy[j];
    const tries: Label[] = [
      { x: prefer === 'start' ? x + 9 : x - 9, y: y + 4, text, anchor: prefer },
      { x: prefer === 'start' ? x - 9 : x + 9, y: y + 4, text, anchor: prefer === 'start' ? 'end' : 'start' },
      { x: x + 9, y: y - 10, text, anchor: 'start' },
      { x: x - 9, y: y + 18, text, anchor: 'end' },
    ];
    for (const l of tries) {
      const bx = l.anchor === 'start' ? l.x : l.x - w;
      const by = l.y - 11;
      if (bx < 2 || bx + w > width - 2 || by < 2 || by + h > height - 30) continue;
      if (placed.some((p) => bx < p.x + p.w && bx + w > p.x && by < p.y + p.h && by + h > p.y)) continue;
      placed.push({ x: bx, y: by, w, h });
      labels.push(l);
      return;
    }
  };
  if (geo) {
    for (const j of [0, d.last, d.burst, d.burstP, d.landingP]) {
      if (j !== null) placed.push({ x: geo.sx[j] - 7, y: geo.sy[j] - 7, w: 14, h: 14 });
    }
    addLabel(0, 'Lâcher');
    if (d.landingP !== null) addLabel(d.landingP, 'Atterrissage prévu', 'end');
    if (d.burst !== null) addLabel(d.burst, 'Éclatement');
    if (d.burstP !== null) addLabel(d.burstP, 'Éclatement prévu');
  }

  return (
    <div className="space-y-3">
      <Readout
        value={fmtDist(fromLaunch, units)}
        caption={
          <>
            <LineKey predicted={predicted} />
            <span className="truncate">
              du point de lâcher{dir ? `, vers le ${dir}` : ''}
            </span>
          </>
        }
        aside={
          <>
            <div className="text-foreground font-semibold">{alt !== null ? `à ${fmtAltShort(alt, units)}` : '—'}</div>
            <div>{predicted ? `prévue ${clock(d.x[i])} · ${relative(d.x[i] * 1000, now)}` : i === d.last && live ? 'en direct' : fmtClock(d.x[i] * 1000).slice(0, 5)}</div>
          </>
        }
      />
      <div ref={ref} className="bg-surface relative w-full overflow-hidden rounded-md border" style={{ height }}>
        {geo && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Trajectoire de la sonde vue de dessus, depuis le point de lâcher"
            className="block touch-pan-y select-none"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={leave}
            onPointerUp={(e) => e.pointerType !== 'mouse' && leave(e)}
          >
            <g transform={`translate(${width - 22},18)`} aria-hidden>
              <path d="M0,-8 L4,4 L0,1.5 L-4,4 Z" fill={t.text} />
              <text y={17} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={t.text}>
                N
              </text>
            </g>
            <g transform={`translate(12,${height - 14})`} aria-hidden>
              <path d={`M0,-5 V0 H${geo.scalePx.toFixed(1)} V-5`} fill="none" stroke={t.text} strokeWidth={1.2} />
              <text x={geo.scalePx + 6} y={0} fontSize={11} fill={t.text}>
                {fmtDist(geo.scaleM, units)}
              </text>
            </g>
            <path d={geo.mPath} fill="none" stroke={t.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {geo.fPath && <path d={geo.fPath} fill="none" stroke={t.pred} strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />}
            <circle cx={geo.sx[0]} cy={geo.sy[0]} r={4.5} fill={t.surface} stroke={t.ink} strokeWidth={2} />
            {d.burst !== null && <circle cx={geo.sx[d.burst]} cy={geo.sy[d.burst]} r={4} fill={t.ink} stroke={t.surface} strokeWidth={2} />}
            {d.burstP !== null && <circle cx={geo.sx[d.burstP]} cy={geo.sy[d.burstP]} r={4} fill={t.surface} stroke={t.pred} strokeWidth={2} />}
            {d.landingP !== null && (
              <g>
                <circle cx={geo.sx[d.landingP]} cy={geo.sy[d.landingP]} r={6.5} fill={t.surface} stroke={t.pred} strokeWidth={2} />
                <circle cx={geo.sx[d.landingP]} cy={geo.sy[d.landingP]} r={2} fill={t.pred} />
              </g>
            )}
            <circle cx={geo.sx[d.last]} cy={geo.sy[d.last]} r={5.5} fill={t.accent} stroke={t.surface} strokeWidth={2} />
            {labels.map((l) => (
              <text
                key={l.text}
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                fontSize={11.5}
                fontWeight={600}
                fill={t.ink}
                stroke={t.surface}
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {l.text}
              </text>
            ))}
            {hover !== null && (
              <circle cx={geo.sx[hover]} cy={geo.sy[hover]} r={6} fill="none" stroke={hover > d.last ? t.pred : t.accent} strokeWidth={2} />
            )}
          </svg>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="2" className="text-foreground" />
          </svg>
          Lâcher
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="5" className="fill-primary" />
          </svg>
          Position actuelle
        </span>
        {(d.burst !== null || d.burstP !== null) && (
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              {d.burst !== null ? (
                <circle cx="6" cy="6" r="4" className="fill-foreground" />
              ) : (
                <circle cx="6" cy="6" r="3.5" fill="none" stroke="var(--chart-pred)" strokeWidth="2" />
              )}
            </svg>
            {d.burst !== null ? 'Éclatement' : 'Éclatement prévu'}
          </span>
        )}
        {d.landingP !== null && (
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden>
              <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--chart-pred)" strokeWidth="2" />
              <circle cx="7" cy="7" r="1.8" fill="var(--chart-pred)" />
            </svg>
            Atterrissage prévu
          </span>
        )}
        {d.forecast && (
          <span className="flex items-center gap-1.5">
            <LineKey predicted /> Trajet prévu
          </span>
        )}
      </div>
    </div>
  );
}
