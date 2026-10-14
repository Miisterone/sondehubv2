import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Crosshair } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { Sonde } from '@/lib/types';
import { chartTheme } from '@/lib/chartTheme';
import { ago, fmtAlt, fmtAltShort, fmtCoord, fmtDist, fmtNum, type Units } from '@/lib/format';
import { bearing, compass, distance, elevation } from '@/lib/geo';
import { PHASE_LABEL } from '@/lib/icons';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpHint } from './HelpHint';
import { IconButton, MapIcon, Section, Stat } from './ui';

const LIVE_MS = 120_000;
const SECTORS = 36;
const LIST_MAX = 40;
const PERIOD: Record<string, string> = { '1h': '1 h', '3h': '3 h', '6h': '6 h', '12h': '12 h', '1d': '24 h' };

interface Sample {
  serial: string;
  az: number;
  d: number;
  alt: number;
  el: number;
  t: number;
  snr: number;
}

interface Heard {
  sonde: Sonde;
  first: number;
  last: number;
  frames: number;
  maxD: number;
  bestSnr: number | null;
}

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
}

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

export function ListenerDetail({ callsign }: { callsign: string }) {
  const listener = useStore((s) => s.listeners[callsign]);
  const sondes = useStore((s) => s.sondes);
  const units = useStore((s) => s.settings.units);
  const duration = useStore((s) => s.settings.duration);
  const now = useStore((s) => s.now);
  const me = useStore((s) => s.userLocation);
  const { selectListener, select, requestFly } = useStore.getState();

  const data = useMemo(() => {
    const heard: Heard[] = [];
    const samples: Sample[] = [];
    let pos: { lat: number; lon: number; alt: number } | null = listener ? { lat: listener.lat, lon: listener.lon, alt: listener.alt ?? 0 } : null;
    for (const s of Object.values(sondes)) {
      const r = s.receivers[callsign];
      if (!r) continue;
      if (!pos && r.position) pos = { lat: r.position[0], lon: r.position[1], alt: 0 };
      heard.push({ sonde: s, first: r.firstHeard ?? r.lastHeard, last: r.lastHeard, frames: r.frames ?? 1, maxD: 0, bestSnr: null });
    }
    if (pos) {
      for (const h of heard) {
        const r = h.sonde.receivers[callsign];
        for (const [lon, lat, alt, t, snr] of r.heard ?? []) {
          const d = distance(pos.lat, pos.lon, lat, lon);
          const sm: Sample = { serial: h.sonde.serial, az: bearing(pos.lat, pos.lon, lat, lon), d, alt, el: elevation(pos.lat, pos.lon, pos.alt, lat, lon, alt), t, snr };
          samples.push(sm);
          if (d > h.maxD) h.maxD = d;
          if (Number.isFinite(snr) && (h.bestSnr === null || snr > h.bestSnr)) h.bestSnr = snr;
        }
      }
    }
    heard.sort((a, b) => b.last - a.last);
    const lastActivity = Math.max(listener?.lastSeen ?? 0, heard[0]?.last ?? 0);
    return { heard, samples, pos, lastActivity };
  }, [sondes, callsign, listener]);

  const stats = useMemo(() => {
    const { heard, samples } = data;
    if (!heard.length) return null;
    const far = samples.reduce<Sample | null>((b, s) => (!b || s.d > b.d ? s : b), null);
    const lowest = samples.filter((s) => s.d > 20_000).reduce<Sample | null>((b, s) => (!b || s.el < b.el ? s : b), null);
    const snrs = samples.map((s) => s.snr).filter(Number.isFinite);
    return {
      count: heard.length,
      live: heard.filter((h) => now - h.last < LIVE_MS).length,
      far,
      lowest,
      snr: median(snrs),
      frames: heard.reduce((n, h) => n + h.frames, 0),
    };
  }, [data, now]);

  const mobile = listener?.mobile ?? false;
  const title = mobile ? 'Véhicule de poursuite' : 'Station de réception';
  const fromMe = me && data.pos ? distance(me.lat, me.lon, data.pos.lat, data.pos.lon) : null;

  return (
    <div className="animate-in flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
        <IconButton label="Retour à la liste" side="bottom" onClick={() => selectListener(null)}>
          <ArrowLeft />
        </IconButton>
        <MapIcon id={mobile ? 'chase' : 'listener'} size={22} />
        <div className="ml-0.5 min-w-0 flex-1">
          <h2 className="tabular truncate text-[16px] leading-tight font-semibold">{callsign}</h2>
          <div className="truncate text-[12.5px]">{title}</div>
        </div>
        {data.pos && (
          <IconButton label="Centrer la carte sur la station" side="bottom" onClick={() => requestFly(data.pos!.lon, data.pos!.lat, 9)}>
            <Crosshair className="size-[18px]" />
          </IconButton>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div className="space-y-8 px-5 pt-5 pb-10">
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed">
              {mobile
                ? 'Récepteur embarqué dans un véhicule, utilisé pour poursuivre les sondes jusqu’à leur point de chute.'
                : 'Station radio amateur qui capte les sondes et partage leurs positions avec SondeHub.'}
              {data.lastActivity > 0 ? ` Dernière activité ${ago(data.lastActivity, now)}.` : ''}
            </p>
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <Stat label="Antenne" value={listener?.antenna || '—'} />
              <Stat label="Logiciel" value={listener?.software || '—'} />
              <Stat label="Altitude" value={listener?.alt !== undefined ? fmtAlt(listener.alt, units) : '—'} />
              <Stat label="Distance" value={fromMe !== null ? fmtDist(fromMe, units) : '—'} sub={fromMe !== null ? 'de vous' : undefined} />
            </div>
            {data.pos && <div className="tabular text-faint text-[12.5px]">{fmtCoord(data.pos.lat, data.pos.lon)}</div>}
          </div>

          <Section
            title={
              <>
                Réception
                <HelpHint title="Sur quelles données">
                  Statistiques calculées à partir des sondes chargées dans l’application (historique réglé dans les filtres) et des trames reçues en direct depuis
                  l’ouverture de la page. Elles sont donc partielles pour une station très active.
                </HelpHint>
              </>
            }
            className="border-t pt-6"
          >
            {!stats ? (
              <p className="text-[13px] leading-relaxed">Aucune sonde captée par cette station dans les données chargées (dernières {PERIOD[duration]}). Élargissez l’historique dans les filtres.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Sondes captées" value={stats.count} sub={stats.live ? `${stats.live} en direct` : `sur ${PERIOD[duration]}`} />
                  <Stat label="Portée max" value={stats.far ? fmtDist(stats.far.d, units) : '—'} sub={stats.far ? `à ${fmtAltShort(stats.far.alt, units)}` : undefined} />
                  <Stat label="SNR médian" value={stats.snr !== null ? fmtNum(stats.snr, ' dB', 0) : '—'} sub={`${stats.frames} trames`} />
                </div>
                {stats.lowest && (
                  <p className="text-[12.5px] leading-relaxed">
                    Signal le plus bas sur l’horizon : {stats.lowest.el.toFixed(1).replace('.', ',')}° d’élévation, à {fmtDist(stats.lowest.d, units)} vers le{' '}
                    {compass(stats.lowest.az)} ({stats.lowest.serial}).
                  </p>
                )}
              </>
            )}
          </Section>

          {stats && data.samples.length > 3 && !mobile && (
            <Section
              title={
                <>
                  Couverture
                  <HelpHint title="Lire le diagramme">
                    Chaque point est une position de sonde captée par la station, placée selon sa direction et sa distance. Les secteurs colorés montrent la portée
                    maximale tous les 10° : ils dessinent l’horizon radio de l’antenne, avec ses masques (relief, bâtiments).
                  </HelpHint>
                </>
              }
              className="border-t pt-6"
            >
              <Polar samples={data.samples} units={units} />
            </Section>
          )}

          {stats && (
            <Section title="Sondes captées" className="border-t pt-6">
              <ul className="divide-y rounded-md border">
                {data.heard.slice(0, LIST_MAX).map((h) => {
                  const live = now - h.last < LIVE_MS;
                  return (
                    <li key={h.sonde.serial}>
                      <button
                        type="button"
                        onClick={() => select(h.sonde.serial, true)}
                        className="hover:bg-surface focus-visible:ring-ring/50 flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
                      >
                        <MapIcon id={`sonde-${h.sonde.phase}`} size={20} />
                        <span className="min-w-0 flex-1">
                          <span className="tabular text-foreground block truncate text-[13px] font-semibold">{h.sonde.serial}</span>
                          <span className="block truncate text-[12.5px]">
                            {live ? 'En direct' : `Captée ${ago(h.last, now)}`}
                            {h.maxD > 0 ? `, jusqu’à ${fmtDist(h.maxD, units)}` : ''}
                            {`, ${PHASE_LABEL[h.sonde.phase].toLowerCase()}`}
                          </span>
                        </span>
                        {h.bestSnr !== null && <span className="tabular text-faint shrink-0 text-[12px]">{Math.round(h.bestSnr)} dB</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {data.heard.length > LIST_MAX && <p className="text-[12.5px]">Et {data.heard.length - LIST_MAX} autres.</p>}
            </Section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Polar({ samples, units }: { samples: Sample[]; units: Units }) {
  const [ref, width] = useWidth();
  const theme = useStore((s) => s.settings.theme);
  const t = chartTheme(theme);
  const [hover, setHover] = useState<Sample | null>(null);
  const size = Math.min(width, 340);

  const geo = useMemo(() => {
    if (size < 120) return null;
    const max = Math.max(...samples.map((s) => s.d));
    const stepM = [5_000, 10_000, 25_000, 50_000, 100_000, 200_000].find((m) => max / m <= 4) ?? 250_000;
    const rMax = Math.ceil((max * 1.05) / stepM) * stepM;
    const c = size / 2;
    const k = (c - 16) / rMax;
    const xy = (az: number, d: number) => [c + Math.sin((az * Math.PI) / 180) * d * k, c - Math.cos((az * Math.PI) / 180) * d * k] as const;
    const best = new Array<number>(SECTORS).fill(0);
    for (const s of samples) {
      const i = Math.floor((((s.az % 360) + 360) % 360) / (360 / SECTORS)) % SECTORS;
      best[i] = Math.max(best[i], s.d);
    }
    const width = 360 / SECTORS;
    const envelope = best
      .map((d, i) => {
        if (d <= 0) return '';
        const [x1, y1] = xy(i * width, d);
        const [x2, y2] = xy((i + 1) * width, d);
        const r = d * k;
        return `M${c},${c}L${x1.toFixed(1)},${y1.toFixed(1)}A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}Z`;
      })
      .join('');
    const rings = Array.from({ length: Math.round(rMax / stepM) }, (_, i) => (i + 1) * stepM);
    const dots = samples.map((s) => ({ s, p: xy(s.az, s.d) }));
    return { c, k, rings, envelope, dots };
  }, [size, samples]);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best: Sample | null = null;
    let bd = Infinity;
    for (const { s, p } of geo.dots) {
      const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = s;
      }
    }
    setHover(bd < 24 ** 2 ? best : null);
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-[40px] items-end justify-between gap-3 text-[12.5px]">
        {hover ? (
          <>
            <div className="min-w-0">
              <div className="tabular text-foreground truncate font-semibold">{hover.serial}</div>
              <div className="truncate">
                {fmtDist(hover.d, units)} vers le {compass(hover.az)}, à {fmtAltShort(hover.alt, units)}
              </div>
            </div>
            <div className="tabular shrink-0 text-right">
              <div className="text-foreground font-semibold">élévation {hover.el.toFixed(1).replace('.', ',')}°</div>
              <div>{Number.isFinite(hover.snr) ? `SNR ${Math.round(hover.snr)} dB` : 'SNR —'}</div>
            </div>
          </>
        ) : (
          <span>{samples.length} positions captées. Survolez un point pour le détail.</span>
        )}
      </div>
      <div ref={ref} className="flex w-full justify-center rounded-md border">
        {geo && (
          <svg
            width={size}
            height={size}
            role="img"
            aria-label="Diagramme polaire de couverture de la station"
            className="block touch-pan-y select-none"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setHover(null)}
          >
            {geo.rings.map((r) => (
              <g key={r}>
                <circle cx={geo.c} cy={geo.c} r={r * geo.k} fill="none" stroke={t.axis} />
                <text x={geo.c + r * geo.k * 0.707 + 2} y={geo.c - r * geo.k * 0.707 - 2} fontSize={10} fill={t.text}>
                  {fmtDist(r, units)}
                </text>
              </g>
            ))}
            <path d={`M${geo.c},6V${size - 6}M6,${geo.c}H${size - 6}`} stroke={t.zero} strokeWidth={1} />
            <text x={geo.c + 4} y={14} fontSize={10.5} fontWeight={600} fill={t.text}>
              N
            </text>
            {geo.envelope && <path d={geo.envelope} fill={t.accentFill} stroke={t.accent} strokeWidth={1} strokeLinejoin="round" />}
            {geo.dots.map(({ p }, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={2} fill={t.ink} fillOpacity={0.45} />
            ))}
            {hover && (
              <circle cx={geo.c + Math.sin((hover.az * Math.PI) / 180) * hover.d * geo.k} cy={geo.c - Math.cos((hover.az * Math.PI) / 180) * hover.d * geo.k} r={5} fill="none" stroke={t.accent} strokeWidth={2} />
            )}
            <circle cx={geo.c} cy={geo.c} r={3.5} fill={t.ink} stroke={t.surface} strokeWidth={1.5} />
          </svg>
        )}
      </div>
    </div>
  );
}
