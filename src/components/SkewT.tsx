import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useStore } from '@/store/useStore';
import { chartTheme } from '@/lib/chartTheme';
import { atPressure, dryAdiabat, mixingRatioTemp, moistAdiabat, type Profile, type WindLevel } from '@/lib/atmo';
import { fmtAlt, fmtHSpeed, fmtNum, fmtTemp, type Units } from '@/lib/format';
import { Readout } from './ChartParts';
import { Segmented } from './ui';

type View = 'tropo' | 'full';

const P_BOTTOM = 1050;
const T_MIN = -40;
const T_MAX = 45;
const PAD = { l: 34, r: 30, t: 8, b: 20 };
const ISOBARS = [1000, 850, 700, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30, 20, 10];
const MIXING = [1, 2, 4, 8, 16];
const MOIST_START = [-12, -6, 0, 6, 12, 18, 24, 30];
const MAX_POINTS = 450;
const KT = 1.943844;

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

const steps = (from: number, to: number, n: number) => Array.from({ length: n + 1 }, (_, i) => Math.exp(Math.log(from) + ((Math.log(to) - Math.log(from)) * i) / n));

function windFrom(deg: number): string {
  return `${Math.round(deg)}°`;
}

function Barb({ x, y, w, colour }: { x: number; y: number; w: WindLevel; colour: string }) {
  const kt = w.speed * KT;
  if (kt < 2.5) return <circle cx={x} cy={y} r={3} fill="none" stroke={colour} strokeWidth={1.2} />;
  const L = 22;
  let rest = Math.round(kt / 5) * 5;
  const parts: string[] = [];
  const pennants: string[] = [];
  let yy = -L;
  while (rest >= 50) {
    pennants.push(`0,${yy} 8,${yy + 2} 0,${yy + 5}`);
    yy += 6;
    rest -= 50;
  }
  while (rest >= 10) {
    parts.push(`M0,${yy}L8,${yy - 3}`);
    yy += 3.5;
    rest -= 10;
  }
  if (rest >= 5) {
    if (yy === -L) yy += 3.5;
    parts.push(`M0,${yy}L4,${yy - 1.5}`);
  }
  return (
    <g transform={`translate(${x},${y}) rotate(${w.dir})`} stroke={colour} fill={colour} strokeWidth={1.2} strokeLinecap="round">
      <path d={`M0,0L0,${-L}${parts.join('')}`} fill="none" />
      {pennants.map((p) => (
        <polygon key={p} points={p} stroke="none" />
      ))}
    </g>
  );
}

export function SkewT({ profile, units }: { profile: Profile; units: Units }) {
  const [ref, width] = useWidth();
  const theme = useStore((s) => s.settings.theme);
  const t = chartTheme(theme);
  const minP = profile.levels[profile.levels.length - 1].p;
  const [view, setView] = useState<View>('tropo');
  const [hover, setHover] = useState<number | null>(null);
  const timer = useRef(0);
  const pTop = view === 'tropo' ? 100 : Math.max(5, Math.min(100, Math.floor(minP / 5) * 5));
  const height = Math.round(Math.min(460, Math.max(320, width * 1.12)));

  const geo = useMemo(() => {
    if (width < 120) return null;
    const pw = width - PAD.l - PAD.r;
    const ph = height - PAD.t - PAD.b;
    const L = Math.log(P_BOTTOM) - Math.log(pTop);
    const S = ((T_MAX - T_MIN) * ph) / (pw * L);
    const y = (p: number) => PAD.t + (ph * (Math.log(p) - Math.log(pTop))) / L;
    const x = (T: number, p: number) => PAD.l + ((T - T_MIN + S * (Math.log(P_BOTTOM) - Math.log(p))) / (T_MAX - T_MIN)) * pw;
    const pOf = (py: number) => Math.exp(Math.log(pTop) + ((py - PAD.t) / ph) * L);
    const path = (pts: { T: number | null; p: number }[]) => {
      let d = '';
      let pen = false;
      for (const q of pts) {
        if (q.T === null || !Number.isFinite(q.T) || q.p > P_BOTTOM || q.p < pTop * 0.98) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${x(q.T, q.p).toFixed(1)},${y(q.p).toFixed(1)}`;
        pen = true;
      }
      return d;
    };

    const isotherms = Array.from({ length: 17 }, (_, i) => -120 + i * 10).map((T) => ({ T, d: path([{ T, p: P_BOTTOM }, { T, p: pTop }]) }));
    const sample = steps(P_BOTTOM, pTop, 40);
    const dry = Array.from({ length: 23 }, (_, i) => 250 + i * 10).map((theta) => path(sample.map((p) => ({ T: dryAdiabat(theta, p), p }))));
    const moistP = steps(1000, Math.max(pTop, 150), 30);
    const moist = MOIST_START.map((t0) => path(moistAdiabat(1000, t0, moistP).map((T, i) => ({ T, p: moistP[i] }))));
    const mixP = steps(P_BOTTOM, 600, 8);
    const mixing = MIXING.map((g) => ({ g, d: path(mixP.map((p) => ({ T: mixingRatioTemp(p, g / 1000), p }))), x: x(mixingRatioTemp(620, g / 1000), 620) }));

    const lv = profile.levels.filter((l) => l.p >= pTop * 0.98);
    const stride = Math.max(1, Math.ceil(lv.length / MAX_POINTS));
    const thin = lv.filter((_, i) => i % stride === 0 || i === lv.length - 1);
    const temp = path(thin.map((l) => ({ T: l.t, p: l.p })));
    const dew = path(thin.map((l) => ({ T: l.td, p: l.p })));
    const parcel = path(profile.parcel.map((q) => ({ T: q.t, p: q.p })));

    const barbs: WindLevel[] = [];
    let lastY = Infinity;
    for (const w of profile.winds) {
      if (w.p === null || w.p < pTop || w.p > P_BOTTOM) continue;
      const wy = y(w.p);
      if (lastY - wy >= 22) {
        barbs.push(w);
        lastY = wy;
      }
    }
    return { pw, ph, x, y, pOf, isotherms, dry, moist, mixing, temp, dew, parcel, barbs };
  }, [width, height, pTop, profile]);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const py = e.clientY - r.top;
    window.clearTimeout(timer.current);
    if (py < PAD.t || py > height - PAD.b) return setHover(null);
    setHover(Math.min(P_BOTTOM, Math.max(pTop, geo.pOf(py))));
  };
  const leave = (e: PointerEvent<SVGSVGElement>) => {
    window.clearTimeout(timer.current);
    if (e.pointerType === 'mouse') setHover(null);
    else timer.current = window.setTimeout(() => setHover(null), 2500);
  };

  const first = profile.levels[0];
  const p = hover === null ? first.p : Math.min(hover, first.p);
  const T = atPressure(profile.levels, p, 't') ?? (hover === null ? first.t : null);
  const Td = atPressure(profile.levels, p, 'td') ?? (hover === null ? first.td : null);
  const rh = atPressure(profile.levels, p, 'rh') ?? (hover === null ? first.rh : null);
  const z = atPressure(profile.levels, p, 'z') ?? (hover === null ? first.z : null);
  const wind = useMemo(() => {
    let best: WindLevel | null = null;
    for (const w of profile.winds) if (w.p !== null && (!best || Math.abs(w.p - p) < Math.abs((best.p as number) - p))) best = w;
    return best && Math.abs(Math.log((best.p as number) / p)) < 0.08 ? best : null;
  }, [profile.winds, p]);
  const outside = hover !== null && hover > first.p;
  const tropo = profile.indices.tropopause;
  const lcl = profile.indices.lcl;

  return (
    <div className="space-y-3">
      <Segmented<View>
        size="sm"
        value={view}
        onChange={setView}
        className="w-full [&>*]:flex-1"
        options={[
          { value: 'tropo', label: 'Jusqu’à 100 hPa', title: 'Troposphère et basse stratosphère' },
          { value: 'full', label: 'Vol complet', title: `Jusqu’à ${Math.round(minP)} hPa` },
        ]}
      />
      <Readout
        value={
          outside ? (
            '—'
          ) : (
            <span>
              {fmtTemp(T ?? undefined, units)}
              {Td !== null && <span className="text-muted-foreground font-sans text-[15px] font-normal"> · rosée {fmtTemp(Td, units)}</span>}
            </span>
          )
        }
        caption={
          <span className="truncate">
            {outside ? 'Sous le point de départ de la sonde' : `${fmtNum(p, ' hPa', 0)} · ${fmtAlt(z ?? undefined, units)}${hover === null ? ' · départ' : ''}`}
          </span>
        }
        aside={
          !outside && (
            <>
              <div className="text-foreground font-semibold">{wind ? `${windFrom(wind.dir)} · ${fmtHSpeed(wind.speed, units)}` : '—'}</div>
              <div>{rh !== null ? `HR ${fmtNum(rh, ' %', 0)}` : 'vent'}</div>
            </>
          )
        }
      />
      <div ref={ref} className="relative w-full overflow-hidden rounded-md border" style={{ height }}>
        {geo && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Émagramme Skew-T : température et point de rosée selon la pression, avec adiabatiques et vent"
            className="block touch-pan-y select-none"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={leave}
            onPointerUp={(e) => e.pointerType !== 'mouse' && leave(e)}
          >
            <defs>
              <clipPath id="skewt-clip">
                <rect x={PAD.l} y={PAD.t} width={geo.pw} height={geo.ph} />
              </clipPath>
            </defs>
            <g clipPath="url(#skewt-clip)" fill="none">
              {geo.dry.map((d, i) => (
                <path key={`d${i}`} d={d} stroke={t.zero} strokeOpacity={0.45} strokeWidth={0.8} />
              ))}
              {geo.moist.map((d, i) => (
                <path key={`m${i}`} d={d} stroke={t.zero} strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray="5 3" />
              ))}
              {geo.mixing.map((m) => (
                <path key={`w${m.g}`} d={m.d} stroke={t.zero} strokeOpacity={0.6} strokeWidth={0.8} strokeDasharray="1.5 3" />
              ))}
              {geo.isotherms.map((i) => (
                <path key={`t${i.T}`} d={i.d} stroke={i.T === 0 ? t.zero : t.axis} strokeWidth={i.T === 0 ? 1.2 : 1} />
              ))}
              {ISOBARS.filter((q) => q >= pTop && q <= P_BOTTOM).map((q) => (
                <path key={`p${q}`} d={`M${PAD.l},${geo.y(q)}H${PAD.l + geo.pw}`} stroke={t.axis} strokeWidth={1} />
              ))}
              {geo.mixing.map((m) => (
                <text key={`wl${m.g}`} x={m.x} y={geo.y(620) - 3} fontSize={9.5} fill={t.text} textAnchor="middle" stroke="none">
                  {m.g}
                </text>
              ))}
              {tropo && tropo.p >= pTop && (
                <g>
                  <path d={`M${PAD.l},${geo.y(tropo.p)}H${PAD.l + geo.pw}`} stroke={t.ink} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />
                  <text x={PAD.l + 4} y={geo.y(tropo.p) - 4} fontSize={10.5} fill={t.text} stroke="none">
                    Tropopause
                  </text>
                </g>
              )}
              {geo.parcel && <path d={geo.parcel} stroke={t.pred} strokeWidth={1.5} strokeDasharray="6 4" />}
              <path d={geo.dew} stroke={t.accent} strokeWidth={2} strokeLinejoin="round" />
              <path d={geo.temp} stroke={t.ink} strokeWidth={2} strokeLinejoin="round" />
              {lcl && lcl.p >= pTop && (
                <g>
                  <circle cx={geo.x(lcl.t, lcl.p)} cy={geo.y(lcl.p)} r={3.5} fill={t.surface} stroke={t.pred} strokeWidth={1.5} />
                  <text x={geo.x(lcl.t, lcl.p) + 7} y={geo.y(lcl.p) + 4} fontSize={10.5} fontWeight={600} fill={t.ink} stroke={t.surface} strokeWidth={3} paintOrder="stroke">
                    LCL
                  </text>
                </g>
              )}
              {hover !== null && <path d={`M${PAD.l},${geo.y(hover)}H${PAD.l + geo.pw}`} stroke={t.ink} strokeOpacity={0.5} strokeWidth={1} />}
            </g>
            {ISOBARS.filter((q) => q >= pTop && q <= 1000).map((q) => (
              <text key={`pl${q}`} x={PAD.l - 5} y={geo.y(q) + 3.5} fontSize={10} fill={t.text} textAnchor="end">
                {q}
              </text>
            ))}
            {[-40, -20, 0, 20, 40].map((T) => (
              <text key={`tl${T}`} x={geo.x(T, P_BOTTOM)} y={height - 6} fontSize={10} fill={t.text} textAnchor="middle">
                {T}
              </text>
            ))}
            <text x={PAD.l + geo.pw - 2} y={height - 6} fontSize={10} fill={t.text} textAnchor="end">
              °C
            </text>
            <path d={`M${width - PAD.r + 2},${PAD.t}V${PAD.t + geo.ph}`} stroke={t.axis} />
            {geo.barbs.map((w) => (
              <Barb key={w.z} x={width - PAD.r / 2 + 1} y={geo.y(w.p as number)} w={w} colour={t.ink} />
            ))}
          </svg>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-foreground inline-block h-0.5 w-4 rounded-full" /> Température
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-primary inline-block h-0.5 w-4 rounded-full" /> Point de rosée
        </span>
        {profile.parcel.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="key-dashed" /> Particule de surface
          </span>
        )}
        <span>Pointillés gris : adiabatiques humides, rapport de mélange (g/kg)</span>
        <span>Barbules : vent en nœuds</span>
      </div>
    </div>
  );
}
