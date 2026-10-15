import type { ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useStore, type Atmo3dSettings } from '@/store/useStore';
import type { FlightData } from '@/lib/flight';
import type { AtmoScene, AtmoView } from '@/lib/atmo3d';
import type { FlightPhase } from '@/lib/types';
import { distance } from '@/lib/geo';
import { fmtAlt, fmtAltShort, fmtDist, type Units } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { LineKey } from './ChartParts';
import { cx } from './ui';
import { altRange } from './atmoFormat';
import { intlTag, t, useT } from '@/i18n';

export const REPLAY_SPEEDS = [300, 600, 1200] as const;

export const clock = (s: number) => new Date(s * 1000).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });

export type AssetState = 'off' | 'loading' | 'ready' | 'error';

export function ViewSwitch({ value, onChange, stretch = false }: { value: AtmoView; onChange: (v: AtmoView) => void; stretch?: boolean }) {
  const tr = useT();
  const views: AtmoView[] = ['persp', 'profile', 'top'];
  const labels: Record<AtmoView, string> = { persp: tr('atmo3d.view.persp'), profile: tr('atmo3d.view.profile'), top: tr('atmo3d.view.top') };
  return (
    <div role="group" aria-label={tr('atmo3d.view.label')} className={cx('bg-surface flex gap-0.5 rounded-lg border p-[3px]', stretch && 'w-full')}>
      {views.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'focus-visible:ring-ring/50 rounded-md border px-4 text-[13px] outline-none focus-visible:ring-2',
            stretch ? 'h-10 flex-1 text-[14px]' : 'h-8',
            value === v ? 'bg-background text-foreground border-border font-semibold' : 'text-muted-foreground hover:text-foreground border-transparent',
          )}
        >
          {labels[v]}
        </button>
      ))}
    </div>
  );
}

interface Milestone {
  key: string;
  t: number;
  name: string;
  tone: 'ink' | 'accent' | 'pred';
  marker: 'launch' | 'crossing' | 'burst' | 'burstP' | 'landing';
}

function milestones(scene: AtmoScene, phase: FlightPhase): Milestone[] {
  const out: Milestone[] = [{ key: 'launch', t: scene.times.launch, name: scene.airborneStart ? t('atmo3d.scene.firstSignal') : t('atmo3d.scene.launch'), tone: 'ink', marker: 'launch' }];
  if (scene.crossing) out.push({ key: 'crossing', t: scene.crossing.t, name: t('atmo3d.timeline.tropopause'), tone: 'ink', marker: 'crossing' });
  if (scene.times.burst !== null) out.push({ key: 'burst', t: scene.times.burst, name: t(scene.glider ? 'atmo3d.scene.release' : 'atmo3d.scene.burst'), tone: 'ink', marker: 'burst' });
  if (scene.times.burstPredicted !== null) out.push({ key: 'burstP', t: scene.times.burstPredicted, name: t('atmo3d.scene.burstPredicted'), tone: 'pred', marker: 'burstP' });
  if (scene.times.landing !== null) out.push({ key: 'landing', t: scene.times.landing, name: t('atmo3d.scene.landingPredicted'), tone: 'pred', marker: 'landing' });
  else if (phase === 'landed') out.push({ key: 'landing', t: scene.times.now, name: t('atmo3d.scene.landing'), tone: 'ink', marker: 'landing' });
  return out;
}

const MARKER: Record<Milestone['marker'], string> = {
  launch: 'border-foreground bg-background border-2',
  crossing: 'border-primary bg-background border-2',
  burst: 'bg-foreground border-background border-2',
  burstP: 'border-[var(--chart-pred)] bg-background border-2 border-dashed',
  landing: 'border-[var(--chart-pred)] bg-background border-2',
};

export function AtmoTimeline({ serial, flight, scene, phase, compact }: { serial: string; flight: FlightData; scene: AtmoScene; phase: FlightPhase; compact: boolean }) {
  const tr = useT();
  const replay = useStore((s) => (s.replay?.serial === serial ? s.replay : null));
  const { setReplay } = useStore.getState();
  const start = scene.times.launch;
  const measuredEnd = scene.times.now;
  const end = Math.max(measuredEnd, scene.times.landing ?? measuredEnd);
  const total = Math.max(1, end - start);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - start) / total) * 100));
  const nowPct = pct(measuredEnd);
  const cur = replay ? replay.t : measuredEnd;
  const curPct = pct(cur);
  const atEnd = replay ? replay.t >= measuredEnd : false;
  const canReplay = flight.last > 2 && measuredEnd - start >= 120;
  const ms = milestones(scene, phase);
  const live = phase !== 'landed' && phase !== 'lost';

  const shown: { m: Milestone; p: number }[] = [];
  if (!compact) {
    const candidates = [...ms.map((m) => ({ m, p: pct(m.t) })), ...(live ? [{ m: { key: 'now', t: measuredEnd, name: t('atmo3d.column.now'), tone: 'accent' as const, marker: 'launch' as const }, p: nowPct }] : [])];
    const rank = (k: string) => ['now', 'launch', 'landing', 'crossing', 'burst', 'burstP'].indexOf(k);
    for (const c of candidates.sort((a, b) => rank(a.m.key) - rank(b.m.key))) if (shown.every((s) => Math.abs(s.p - c.p) > 13)) shown.push(c);
  }

  const toggle = () => {
    if (!replay) return;
    if (atEnd) setReplay({ ...replay, t: start, playing: true });
    else setReplay({ ...replay, playing: !replay.playing });
  };
  const speed = replay?.speed ?? REPLAY_SPEEDS[1];
  const nextSpeed = () => {
    if (!replay) return;
    const i = REPLAY_SPEEDS.indexOf(replay.speed as (typeof REPLAY_SPEEDS)[number]);
    setReplay({ ...replay, speed: REPLAY_SPEEDS[(i + 1) % REPLAY_SPEEDS.length] });
  };

  const controls = (
    <div className={cx('flex items-center gap-2', compact ? 'flex-wrap' : 'flex-none')}>
      {replay ? (
        <Button size={compact ? 'default' : 'sm'} className={cx('text-[13.5px]', compact && 'h-11')} onClick={toggle}>
          {atEnd ? <RotateCcw /> : replay.playing ? <Pause /> : <Play />}
          {atEnd ? tr('atmo3d.panel.restart') : replay.playing ? tr('atmo3d.panel.pause') : tr('atmo3d.panel.play')}
        </Button>
      ) : (
        <Button
          size={compact ? 'default' : 'sm'}
          className={cx('text-[13.5px]', compact && 'h-11')}
          disabled={!canReplay}
          onClick={() => setReplay({ serial, t: start, playing: true, speed: REPLAY_SPEEDS[1] })}
        >
          <Play /> {tr('atmo3d.timeline.replay')}
        </Button>
      )}
      {replay && (
        <Button variant="outline" size={compact ? 'default' : 'sm'} className={cx('tabular text-[13px]', compact && 'h-11')} onClick={nextSpeed} aria-label={tr('atmo3d.timeline.speedAria', { speed })}>
          {compact ? `×${speed}` : tr('atmo3d.timeline.speed', { speed })}
        </Button>
      )}
      {replay && (
        <Button variant="ghost" size={compact ? 'default' : 'sm'} className={cx('text-[13px]', compact ? 'ml-auto h-11' : '')} onClick={() => setReplay(null)}>
          {tr('atmo3d.timeline.live')}
        </Button>
      )}
    </div>
  );

  const track = (
    <div className={cx('relative min-w-0 flex-1', compact ? 'h-[42px]' : 'h-[64px]')}>
      {shown.map(({ m, p }) => (
        <div
          key={m.key}
          className={cx('absolute top-0 text-[12px] leading-4 whitespace-nowrap', p < 6 ? 'text-left' : p > 94 ? 'text-right' : 'text-center')}
          style={p < 6 ? { left: 0 } : p > 94 ? { right: 0 } : { left: `${p}%`, transform: 'translateX(-50%)' }}
        >
          <div className={cx('font-semibold', m.tone === 'accent' ? 'text-primary' : m.tone === 'pred' ? 'text-muted-foreground' : 'text-foreground')}>{m.name}</div>
          <div className={cx('tabular', m.key === 'now' ? 'text-foreground font-semibold' : 'text-faint')}>{clock(m.t)}</div>
        </div>
      ))}
      <div className={cx('absolute right-0 left-0', compact ? 'top-[8px]' : 'top-[38px]')}>
        <div className="relative h-5">
          {replay ? (
            <>
              <div className="bg-primary absolute top-[8px] left-0 h-1 rounded-full" style={{ width: `${curPct}%` }} />
              <div className="bg-primary/25 absolute top-[8px] h-1 rounded-full" style={{ left: `${curPct}%`, width: `${Math.max(0, nowPct - curPct)}%` }} />
            </>
          ) : (
            <div className="bg-primary absolute top-[8px] left-0 h-1 rounded-full" style={{ width: `${nowPct}%` }} />
          )}
          {nowPct < 99.5 && <div className="border-[var(--chart-pred)] absolute top-[9px] right-0 h-0 border-t-2 border-dashed" style={{ left: `${nowPct}%` }} />}
          {ms.map((m) => (
            <span key={m.key} className={cx('absolute top-[4px] block size-3 rounded-full', MARKER[m.marker])} style={{ left: `calc(${pct(m.t)}% - 6px)` }} />
          ))}
          {replay && live && <span className="border-primary bg-background absolute top-[4px] block size-3 rounded-full border-2" style={{ left: `calc(${nowPct}% - 6px)` }} />}
          <input
            type="range"
            min={start}
            max={measuredEnd}
            step={1}
            value={Math.round(Math.min(cur, measuredEnd))}
            onChange={(e) => setReplay({ serial, t: Number(e.target.value), playing: false, speed })}
            aria-label={tr('atmo3d.panel.positionInFlight')}
            aria-valuetext={clock(cur)}
            className="peer absolute top-0 left-0 h-5 cursor-pointer opacity-0"
            style={{ width: `${nowPct}%` }}
          />
          <span
            className="bg-primary border-background ring-primary peer-focus-visible:ring-ring/60 pointer-events-none absolute top-0 block size-5 rounded-full border-[3px] ring-1 peer-focus-visible:ring-4"
            style={{ left: `calc(${curPct}% - 10px)` }}
          />
        </div>
      </div>
      {compact && (
        <div className="tabular absolute right-0 bottom-0 left-0 h-4 text-[12px] leading-4">
          <span className="text-faint absolute left-0">{clock(start)}</span>
          {curPct > 14 && curPct < 86 && (
            <span className="text-foreground absolute font-semibold" style={{ left: `${curPct}%`, transform: 'translateX(-50%)' }}>
              {clock(cur)}
            </span>
          )}
          <span className="text-faint absolute right-0">{clock(end)}</span>
        </div>
      )}
    </div>
  );

  return compact ? (
    <div className="space-y-2.5">
      {controls}
      {track}
    </div>
  ) : (
    <div className="flex items-center gap-6">
      {controls}
      {track}
    </div>
  );
}

interface Row {
  key: string;
  z: number;
  name: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
  muted?: boolean;
}

export function AtmoColumn({ scene, units, alt, replaying, height = 330 }: { scene: AtmoScene; units: Units; alt: number; replaying: boolean; height?: number }) {
  const tr = useT();
  const k = height / scene.top;
  const px = (z: number) => Math.max(0, Math.min(height, z * k));
  const ozone = scene.bands.find((b) => b.id === 'ozone');
  const crossed = !!scene.crossing && (replaying ? alt >= scene.tropopause.z || scene.times.burst !== null : true);
  const rows: Row[] = [];
  if (scene.burst) rows.push({ key: 'burst', z: scene.burst[2], name: tr(scene.glider ? 'atmo3d.scene.release' : 'atmo3d.scene.burst'), value: fmtAltShort(scene.burst[2], units), strong: true });
  if (scene.burstP) rows.push({ key: 'burstP', z: scene.burstP[2], name: tr('atmo3d.scene.burstPredicted'), value: fmtAltShort(scene.burstP[2], units), muted: true });
  rows.push({ key: 'now', z: alt, name: replaying ? tr('atmo3d.column.replay') : tr('atmo3d.column.now'), value: fmtAltShort(alt, units), strong: true, accent: true });
  if (ozone) rows.push({ key: 'ozone', z: ozone.from + 1000, name: tr('atmo3d.layer.ozone'), value: altRange(ozone.from, ozone.to, units) });
  rows.push({ key: 'tropo', z: scene.tropopause.z, name: crossed ? tr('atmo3d.scene.crossed') : tr('atmo3d.scene.tropopauseName'), value: fmtAltShort(scene.tropopause.z, units), strong: true });
  for (const [a, b] of scene.clouds)
    rows.push({ key: `cloud-${a}`, z: (a + b) / 2, name: tr('atmo3d.column.clouds'), value: altRange(a, b, units) });
  if (scene.freezing !== null && scene.freezing > 0) rows.push({ key: 'freezing', z: scene.freezing, name: tr('atmo3d.column.freezing'), value: fmtAlt(scene.freezing, units) });
  rows.push({ key: 'launch', z: scene.launch[2], name: scene.airborneStart ? tr('atmo3d.scene.firstSignal') : tr('atmo3d.scene.launch'), value: fmtAlt(scene.launch[2], units), strong: true });

  const placed: { r: Row; top: number }[] = [];
  const sorted = [...rows].sort((a, b) => b.z - a.z);
  let next = -Infinity;
  for (const r of sorted) {
    const top = Math.max(height - px(r.z) - 9, next);
    placed.push({ r, top });
    next = top + 19;
  }
  const overflow = next - 19 - (height - 9);
  if (overflow > 0) for (let i = placed.length - 1, shift = overflow; i >= 0 && shift > 0; i--) placed[i].top -= shift;
  for (let i = placed.length - 2; i >= 0; i--) if (placed[i].top > placed[i + 1].top - 19) placed[i].top = placed[i + 1].top - 19;

  const ticks: number[] = [];
  const step = units === 'metric' ? (scene.top > 30_000 ? 10_000 : 5_000) : scene.top > 30_000 ? 30_480 : 15_240;
  for (let z = 0; z <= scene.top; z += step) ticks.push(z);
  const tick = (z: number) => (z === 0 ? '0' : units === 'metric' ? `${Math.round(z / 1000)} km` : `${Math.round((z * 3.28084) / 1000)} kft`);

  return (
    <div
      role="img"
      aria-label={tr('atmo3d.column.aria', { alt: fmtAltShort(alt, units), tropopause: fmtAltShort(scene.tropopause.z, units) })}
      className="relative text-[12.5px] leading-[18px]"
      style={{ height: height + 12 }}
    >
      {ticks.map((z) => (
        <span key={z} className="text-faint tabular absolute left-0 w-8 text-right text-[11px]" style={{ top: height - px(z) - 8 }}>
          {tick(z)}
        </span>
      ))}
      <div className="absolute top-0 left-10 w-7 overflow-hidden rounded-md border" style={{ height, background: 'var(--surface)' }}>
        <div className="absolute right-0 bottom-0 left-0" style={{ height: px(scene.tropopause.z), background: 'var(--muted)' }} />
        {ozone && <div className="bg-primary/10 absolute right-0 left-0" style={{ bottom: px(ozone.from), height: px(ozone.to) - px(ozone.from) }} />}
        {scene.clouds.map(([a, b]) => (
          <div key={a} className="bg-border absolute right-0 left-0" style={{ bottom: px(a), height: Math.max(2, px(b) - px(a)) }} />
        ))}
        <div className="absolute right-0 left-0 border-t-[1.5px]" style={{ bottom: px(scene.tropopause.z), borderColor: 'var(--text-faint)', borderTopStyle: scene.tropopause.measured ? 'solid' : 'dashed' }} />
        {scene.freezing !== null && scene.freezing > 0 && <div className="border-[var(--chart-pred)] absolute right-0 left-0 border-t border-dashed" style={{ bottom: px(scene.freezing) }} />}
        <div className="bg-primary absolute left-[11px] w-[3px] rounded-full" style={{ bottom: 0, height: px(alt) }} />
        {scene.burstP && <div className="border-[var(--chart-pred)] absolute left-[11px] border-l-2 border-dashed" style={{ bottom: px(alt), height: Math.max(0, px(scene.burstP[2]) - px(alt)) }} />}
      </div>
      {scene.burstP && <span className="border-[var(--chart-pred)] bg-background absolute left-[48px] block size-3 rounded-full border-2 border-dashed" style={{ top: height - px(scene.burstP[2]) - 6 }} />}
      {scene.burst && <span className="bg-foreground border-background absolute left-[48px] block size-3 rounded-full border-2" style={{ top: height - px(scene.burst[2]) - 6 }} />}
      <span className="bg-background border-foreground absolute left-[48px] block size-3 rounded-full border-2" style={{ top: height - px(scene.launch[2]) - 6 }} />
      <span className="bg-primary border-background absolute left-[47px] block size-3.5 rounded-full border-2" style={{ top: height - px(alt) - 7 }} />
      {placed.map(({ r, top }) => (
        <div key={r.key} className="absolute right-0 left-[84px] flex justify-between gap-2" style={{ top }}>
          <span className={cx('truncate', r.accent ? 'text-primary font-semibold' : r.strong ? 'text-foreground font-semibold' : r.muted ? 'text-muted-foreground font-semibold' : 'text-muted-foreground')}>{r.name}</span>
          <span className={cx('tabular shrink-0', r.accent ? 'text-foreground font-semibold' : 'text-faint')}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function AtmoSteps({ scene, flight, units, phase, current }: { scene: AtmoScene; flight: FlightData; units: Units; phase: FlightPhase; current: number }) {
  const tr = useT();
  const live = phase !== 'landed' && phase !== 'lost';
  const rows: { key: string; t: number; name: string; value: string; predicted: boolean }[] = [
    { key: 'launch', t: scene.times.launch, name: scene.airborneStart ? tr('atmo3d.scene.firstSignal') : tr('atmo3d.scene.launch'), value: fmtAlt(scene.launch[2], units), predicted: false },
  ];
  if (scene.crossing) rows.push({ key: 'crossing', t: scene.crossing.t, name: tr('atmo3d.scene.crossed'), value: fmtAlt(scene.tropopause.z, units), predicted: false });
  if (scene.burst && scene.times.burst !== null) rows.push({ key: 'burst', t: scene.times.burst, name: tr(scene.glider ? 'atmo3d.scene.release' : 'atmo3d.scene.burst'), value: fmtAlt(scene.burst[2], units), predicted: false });
  rows.push({ key: 'now', t: scene.times.now, name: live ? tr('atmo3d.steps.live') : tr('atmo3d.scene.landing'), value: fmtAlt(scene.current[2], units), predicted: false });
  if (scene.burstP && scene.times.burstPredicted !== null) rows.push({ key: 'burstP', t: scene.times.burstPredicted, name: tr('atmo3d.scene.burstPredicted'), value: fmtAlt(scene.burstP[2], units), predicted: true });
  if (flight.landingP !== null && scene.times.landing !== null) {
    const d = distance(flight.lat[0], flight.lon[0], flight.lat[flight.landingP], flight.lon[flight.landingP]);
    rows.push({ key: 'landing', t: scene.times.landing, name: tr('atmo3d.scene.landingPredicted'), value: tr('atmo3d.steps.distance', { distance: fmtDist(d, units) }), predicted: true });
  }
  rows.sort((a, b) => a.t - b.t);
  let active = 0;
  rows.forEach((r, i) => {
    if (r.t <= current + 1) active = i;
  });

  return (
    <section className="space-y-2">
      <h4 className="font-heading text-foreground text-[15px] font-semibold">{tr('atmo3d.steps.title')}</h4>
      <ol className="tabular border-t text-[13.5px]">
        {rows.map((r, i) => (
          <li key={r.key} className="grid h-11 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 border-b">
            <span className={i === active ? 'text-foreground font-semibold' : 'text-faint'}>{clock(r.t)}</span>
            <span className={cx('flex min-w-0 items-center gap-2 truncate', i === active ? 'text-foreground font-semibold' : r.predicted ? 'text-muted-foreground' : 'text-foreground')}>
              {i === active && <span className="bg-primary block size-2 shrink-0 rounded-full" />}
              {r.name}
            </span>
            <span className={i === active ? 'text-foreground font-semibold' : r.predicted ? 'text-faint' : 'text-muted-foreground'}>{r.value}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AtmoOptionsForm({ settings, onChange, terrainState, units }: { settings: Atmo3dSettings; onChange: (patch: Partial<Atmo3dSettings>) => void; terrainState: AssetState; units: Units }) {
  const tr = useT();
  const step = units === 'metric' ? fmtAltShort(2500, units) : fmtAlt(3048, units);
  const item = (key: 'terrain' | 'map' | 'wallShadow' | 'dropLines', label: string, hint?: ReactNode) => (
    <label key={key} className="text-foreground flex min-h-7 cursor-pointer items-center gap-2.5 text-[13.5px]">
      <input type="checkbox" checked={settings[key]} onChange={(e) => onChange({ [key]: e.target.checked })} className="accent-primary size-4 shrink-0 cursor-pointer" />
      <span className="min-w-0">
        {label}
        {hint && <span className="text-faint ml-1.5 text-[12px]">{hint}</span>}
      </span>
    </label>
  );
  return (
    <fieldset className="space-y-1.5">
      <legend className="font-heading text-foreground mb-2 text-[15px] font-semibold">{tr('atmo3d.options.title')}</legend>
      {item(
        'terrain',
        tr('atmo3d.options.terrain'),
        settings.terrain && terrainState === 'loading' ? tr('atmo3d.options.loading') : settings.terrain && terrainState === 'error' ? tr('atmo3d.options.unavailable') : undefined,
      )}
      {item('map', tr('atmo3d.options.map'))}
      {item('wallShadow', tr('atmo3d.options.wallShadow'))}
      {item('dropLines', tr('atmo3d.options.dropLines', { step }))}
    </fieldset>
  );
}

export function AtmoLegend({ scene, forecast, replaying, section }: { scene: AtmoScene; forecast: boolean; replaying: boolean; section: boolean }) {
  const tr = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
      <span className="flex items-center gap-1.5">
        <LineKey predicted={false} /> {replaying ? tr('atmo3d.legend.replayed') : tr('atmo3d.legend.measured')}
      </span>
      {forecast && (
        <span className="flex items-center gap-1.5">
          <LineKey predicted /> {tr('atmo3d.legend.predicted')}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <svg width="16" height="8" aria-hidden>
          <path d="M0,4 H16" stroke="currentColor" strokeWidth="1.5" strokeDasharray={scene.tropopause.measured ? undefined : '4 3'} className="text-faint" />
        </svg>
        {scene.tropopause.measured ? tr('atmo3d.legend.tropopauseMeasured') : tr('atmo3d.legend.tropopauseTypical')}
      </span>
      {scene.freezing !== null && (
        <span className="flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <path d="M0,4 H16" stroke="var(--chart-pred)" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          {tr('atmo3d.legend.freezing')}
        </span>
      )}
      {scene.clouds.length > 0 && (
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-border block h-2 w-4 rounded-[2px]" />
          {tr('atmo3d.legend.clouds')}
        </span>
      )}
      {section && (
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-muted block h-2 w-4 rounded-[2px] border-t-[1.5px]" style={{ borderTopColor: 'var(--text-faint)' }} />
          {tr('atmo3d.legend.section')}
        </span>
      )}
    </div>
  );
}
