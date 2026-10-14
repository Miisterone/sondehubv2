import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type uPlot from 'uplot';
import type { AlignedData } from 'uplot';
import { useStore } from '@/store/useStore';
import { chartTheme } from '@/lib/chartTheme';
import type { WindLevel } from '@/lib/atmo';
import { fmtAltShort, fmtHSpeed, type Units } from '@/lib/format';
import { compass } from '@/lib/geo';
import { Chart, axis, cursorOptions, drawDot, drawLabel, type Annotate, type ChartTheme } from './Chart';
import { Readout } from './ChartParts';
import { unitsOf } from './FlightCharts';
import { Segmented } from './ui';

type View = 'profile' | 'hodograph';

const nf = (d: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d });

function fromWord(deg: number): string {
  const c = compass(deg);
  return `${Math.round(deg)}° (${c})`;
}

export function WindProfile({ winds, units, syncKey }: { winds: WindLevel[]; units: Units; syncKey: string }) {
  const [view, setView] = useState<View>('profile');
  const jet = useMemo(() => winds.reduce<WindLevel | null>((best, w) => (!best || w.speed > best.speed ? w : best), null), [winds]);
  if (winds.length < 6) return null;
  return (
    <div className="space-y-3">
      <Segmented<View>
        size="sm"
        value={view}
        onChange={setView}
        className="w-full [&>*]:flex-1"
        options={[
          { value: 'profile', label: 'Profil', title: 'Vitesse et direction du vent selon l’altitude' },
          { value: 'hodograph', label: 'Hodographe', title: 'Vecteurs du vent, de bas en haut' },
        ]}
      />
      {view === 'profile' ? <ProfileCharts winds={winds} units={units} syncKey={syncKey} jet={jet} /> : <Hodograph winds={winds} units={units} />}
    </div>
  );
}

function ProfileCharts({ winds, units, syncKey, jet }: { winds: WindLevel[]; units: Units; syncKey: string; jet: WindLevel | null }) {
  const [idx, setIdx] = useState<number | null>(null);
  const u = unitsOf(units);
  const x = useMemo(() => winds.map((w) => w.z * u.alt), [winds, u.alt]);
  const sData = useMemo<AlignedData>(() => [x, winds.map((w) => w.speed * u.hs)], [x, winds, u.hs]);
  const dData = useMemo<AlignedData>(() => [x, winds.map((w) => w.dir)], [x, winds]);
  const i = idx === null || idx >= winds.length ? (jet ? winds.indexOf(jet) : 0) : idx;
  const w = winds[i];

  const altTicks = (_: uPlot, ticks: number[]) => ticks.map((v) => `${nf(0).format(v)} ${u.altU}`);
  const sOpts = (t: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(t, syncKey),
    scales: { x: { time: false }, y: { range: (_: uPlot, _min: number, max: number): uPlot.Range.MinMax => [0, Math.max(10, Math.ceil((max * 1.1) / 20) * 20)] } },
    axes: [axis(t, { values: altTicks, space: 56 }), axis(t, { values: (_: uPlot, ticks: number[]) => ticks.map((v) => `${nf(0).format(v)} ${u.hsU}`), size: 64, space: 28 })],
    series: [{}, { label: 'Vitesse du vent', stroke: t.accent, width: 2, fill: t.accentFill, points: { show: false } }],
  });
  const dOpts = (t: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(t, syncKey),
    scales: { x: { time: false }, y: { range: (): uPlot.Range.MinMax => [0, 360] } },
    axes: [
      axis(t, { values: altTicks, space: 56 }),
      axis(t, { values: (_: uPlot, ticks: number[]) => ticks.map((v) => ({ 0: 'N', 90: 'E', 180: 'S', 270: 'O', 360: 'N' })[v] ?? ''), splits: () => [0, 90, 180, 270, 360], size: 64 }),
    ],
    series: [{}, { label: 'Direction d’où vient le vent', stroke: t.ink, width: 0, paths: () => null, points: { show: true, size: 4, fill: t.ink, stroke: t.ink } }],
  });
  const annotate: Annotate = (pl, t) => {
    if (!jet) return;
    const px = pl.valToPos(jet.z * u.alt, 'x', true);
    const py = pl.valToPos(jet.speed * u.hs, 'y', true);
    drawDot(pl, px, py, t.ink, t.surface, 3);
    drawLabel(pl, t, px, py, `max ${fmtHSpeed(jet.speed, units)}`, { prefer: 'right' });
  };

  return (
    <div className="space-y-3">
      <Readout
        value={fmtHSpeed(w.speed, units)}
        caption={<span className="truncate">à {fmtAltShort(w.z, units)}{w.p !== null ? ` · ${nf(0).format(w.p)} hPa` : ''}</span>}
        aside={
          <>
            <div className="text-foreground font-semibold">vient du {fromWord(w.dir)}</div>
            <div>moyenne sur 250 m</div>
          </>
        }
      />
      <div className="space-y-1">
        <div className="text-foreground text-[12.5px] font-semibold">Vitesse</div>
        <Chart key={`s-${units}`} data={sData} makeOptions={sOpts} annotate={annotate} onIndex={setIdx} height={150} label="Vitesse du vent selon l’altitude, pendant la montée" />
      </div>
      <div className="space-y-1">
        <div className="text-foreground text-[12.5px] font-semibold">Direction d’où vient le vent</div>
        <Chart key={`d-${units}`} data={dData} makeOptions={dOpts} onIndex={setIdx} height={120} label="Direction d’où vient le vent selon l’altitude" />
      </div>
    </div>
  );
}

const LABEL_KM = [1, 3, 6, 9, 12, 15, 20, 25, 30];

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

function Hodograph({ winds, units }: { winds: WindLevel[]; units: Units }) {
  const [ref, width] = useWidth();
  const theme = useStore((s) => s.settings.theme);
  const t = chartTheme(theme);
  const u = unitsOf(units);
  const [hover, setHover] = useState<number | null>(null);
  const [upper, setUpper] = useState(false);
  const shown = useMemo(() => {
    const kept = winds.filter((w) => upper || w.z <= 16000);
    return kept.map((w, i) => {
      const win = kept.slice(Math.max(0, i - 2), i + 3);
      const u = win.reduce((a, x) => a + x.u, 0) / win.length;
      const v = win.reduce((a, x) => a + x.v, 0) / win.length;
      return { ...w, u, v, speed: Math.hypot(u, v), dir: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360 };
    });
  }, [winds, upper]);
  const size = Math.min(width, 360);

  const geo = useMemo(() => {
    if (size < 120 || shown.length < 2) return null;
    const max = Math.max(...shown.map((w) => w.speed)) * u.hs;
    const ringStep = [10, 20, 25, 50, 100].find((s) => max / s <= 5) ?? 100;
    const rMax = Math.ceil((max * 1.05) / ringStep) * ringStep;
    const c = size / 2;
    const k = (c - 18) / rMax;
    const px = (w: { u: number; v: number }) => [c + w.u * u.hs * k, c - w.v * u.hs * k] as const;
    const pts = shown.map(px);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const rings = Array.from({ length: Math.round(rMax / ringStep) }, (_, i) => (i + 1) * ringStep);
    const labels: { i: number; text: string }[] = [];
    for (const km of LABEL_KM) {
      const z = km * 1000;
      let best = -1;
      shown.forEach((w, i) => {
        if (best < 0 || Math.abs(w.z - z) < Math.abs(shown[best].z - z)) best = i;
      });
      if (best < 0 || Math.abs(shown[best].z - z) >= 400) continue;
      const [bx, by] = pts[best];
      if (labels.some((l) => Math.abs(pts[l.i][0] - bx) < 34 && Math.abs(pts[l.i][1] - by) < 14)) continue;
      labels.push({ i: best, text: units === 'metric' ? `${km} km` : `${Math.round(km * 3.28084)} kft` });
    }
    return { c, k, pts, d, rings, labels };
  }, [size, shown, u.hs, units]);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best = -1;
    let bd = Infinity;
    geo.pts.forEach(([px, py], i) => {
      const dd = (px - x) ** 2 + (py - y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(bd < 40 ** 2 ? best : null);
  };

  const w = hover !== null ? shown[hover] : shown[shown.length - 1];

  return (
    <div className="space-y-3">
      <Readout
        value={w ? fmtHSpeed(w.speed, units) : '—'}
        caption={<span className="truncate">{w ? `à ${fmtAltShort(w.z, units)}, vient du ${fromWord(w.dir)}` : ''}</span>}
        aside={
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" className="accent-primary" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
            Au-delà de 16 km
          </label>
        }
      />
      <div ref={ref} className="flex w-full justify-center rounded-md border">
        {geo && (
          <svg
            width={size}
            height={size}
            role="img"
            aria-label="Hodographe : extrémités des vecteurs vent, reliées de bas en haut"
            className="block touch-pan-y select-none"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setHover(null)}
          >
            {geo.rings.map((r) => (
              <g key={r}>
                <circle cx={geo.c} cy={geo.c} r={r * geo.k} fill="none" stroke={t.axis} />
                <text x={geo.c + r * geo.k * 0.707 + 2} y={geo.c - r * geo.k * 0.707 - 2} fontSize={10} fill={t.text}>
                  {r}
                </text>
              </g>
            ))}
            <path d={`M${geo.c},6V${size - 6}M6,${geo.c}H${size - 6}`} stroke={t.zero} strokeWidth={1} />
            <text x={geo.c + 4} y={14} fontSize={10.5} fontWeight={600} fill={t.text}>
              N
            </text>
            <text x={size - 12} y={geo.c - 4} fontSize={10.5} fontWeight={600} fill={t.text}>
              E
            </text>
            <path d={geo.d} fill="none" stroke={t.accent} strokeWidth={2} strokeLinejoin="round" />
            {geo.labels.map((l) => (
              <g key={l.text}>
                <circle cx={geo.pts[l.i][0]} cy={geo.pts[l.i][1]} r={3} fill={t.ink} stroke={t.surface} strokeWidth={1.5} />
                <text x={geo.pts[l.i][0] + 6} y={geo.pts[l.i][1] - 5} fontSize={10.5} fontWeight={600} fill={t.ink} stroke={t.surface} strokeWidth={3} paintOrder="stroke">
                  {l.text}
                </text>
              </g>
            ))}
            {hover !== null && <circle cx={geo.pts[hover][0]} cy={geo.pts[hover][1]} r={5.5} fill="none" stroke={t.accent} strokeWidth={2} />}
          </svg>
        )}
      </div>
      <p className="text-[12.5px] leading-relaxed">
        Chaque point est l’extrémité du vecteur vent (vers où il souffle) à une altitude, lissé sur 1 km, cercles en {u.hsU}. Une courbe qui tourne dans le sens horaire en montant
        signale un vent qui « vire » avec l’altitude, typique d’une advection chaude.
      </p>
    </div>
  );
}
