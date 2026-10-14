import { useEffect, useMemo, useRef } from 'react';
import { ArrowDown, ArrowUp, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { replayAt, type FlightData } from '@/lib/flight';
import { fmtAlt, fmtDuration, fmtHSpeed, fmtTemp, fmtVSpeed, type Units } from '@/lib/format';
import { compass } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { Segmented, Stat } from './ui';

const SPEEDS = [60, 300, 1200] as const;
const clock = (s: number) => new Date(s * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function ReplayStats({ serial, d, units }: { serial: string; d: FlightData; units: Units }) {
  const t = useStore((s) => (s.replay?.serial === serial ? s.replay.t : null));
  const point = useMemo(() => (t === null ? null : replayAt(d, t)), [d, t]);

  if (!point) return null;

  const rising = point.vv === null || point.vv >= 0;
  const moving = point.hdg !== null && point.hs !== null && point.hs > 1;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Stat label="Altitude" value={fmtAlt(point.alt, units)} sub={fmtTemp(point.temp ?? undefined, units)} />
      <Stat
        label={rising ? 'Montée' : 'Descente'}
        value={
          <span className="flex items-center gap-1">
            {point.vv !== null && (rising ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
            {fmtVSpeed(point.vv ?? undefined, units)}
          </span>
        }
        sub="vitesse verticale"
      />
      <Stat label="Dérive" value={fmtHSpeed(point.hs ?? undefined, units)} sub={moving ? `vers le ${compass(point.hdg as number)}` : 'vitesse horizontale'} />
    </div>
  );
}

export function ReplayControls({ serial, d, units }: { serial: string; d: FlightData; units: Units }) {
  const replay = useStore((s) => (s.replay?.serial === serial ? s.replay : null));
  const { setReplay } = useStore.getState();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const start = d.x[0];
  const end = d.x[Math.max(0, d.last)];
  const playing = replay?.playing ?? false;

  useEffect(() => {
    toggleRef.current?.focus({ preventScroll: true });
  }, []);

  useReplayDriver(serial, end);

  const point = useMemo(() => (replay ? replayAt(d, replay.t) : null), [d, replay]);

  if (!replay || !point) return null;

  const atEnd = replay.t >= end;
  const toggle = () => {
    if (atEnd) setReplay({ ...replay, t: start, playing: true });
    else setReplay({ ...replay, playing: !replay.playing });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={toggleRef} size="sm" className="text-[13px]" onClick={toggle} aria-label={atEnd ? 'Rejouer depuis le début' : playing ? 'Pause' : 'Lecture'}>
          {atEnd ? <RotateCcw /> : playing ? <Pause /> : <Play />}
          {atEnd ? 'Recommencer' : playing ? 'Pause' : 'Lecture'}
        </Button>
        <Segmented<string>
          size="sm"
          value={String(replay.speed)}
          onChange={(v) => setReplay({ ...replay, speed: Number(v) })}
          options={SPEEDS.map((s) => ({ value: String(s), label: `×${s}`, title: `${s} fois plus vite que le vol réel` }))}
        />
        <Button variant="ghost" size="sm" className="ml-auto text-[13px]" onClick={() => setReplay(null)}>
          <X /> Quitter
        </Button>
      </div>

      <div className="space-y-1.5">
        <input
          type="range"
          min={start}
          max={end}
          step={1}
          value={Math.round(replay.t)}
          onChange={(e) => setReplay({ ...replay, t: Number(e.target.value) })}
          aria-label="Position dans le vol"
          aria-valuetext={`${clock(point.t)}, ${fmtAlt(point.alt, units)}`}
          className="accent-primary h-1.5 w-full cursor-pointer"
        />
        <div className="tabular text-faint flex justify-between gap-3 text-[12px]">
          <span>{clock(start).slice(0, 5)}</span>
          <span className="text-foreground truncate">
            {clock(point.t)} · T+{fmtDuration((point.t - start) * 1000)}
          </span>
          <span>{clock(end).slice(0, 5)}</span>
        </div>
      </div>
    </div>
  );
}

export function useReplayDriver(serial: string, end: number) {
  const playing = useStore((s) => s.replay?.serial === serial && s.replay.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const step = (now: number) => {
      const r = useStore.getState().replay;
      if (!r || r.serial !== serial || !r.playing) return;
      const dt = Math.min(0.25, (now - prev) / 1000);
      prev = now;
      const t = r.t + dt * r.speed;
      if (t >= end) {
        useStore.getState().setReplay({ ...r, t: end, playing: false });
        return;
      }
      useStore.getState().setReplay({ ...r, t });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, serial, end]);
}

export function canReplay(d: FlightData): boolean {
  return d.last > 2 && d.x[d.last] - d.x[0] >= 120;
}

export function startReplay(serial: string, d: FlightData, opts: { speed?: number; follow?: boolean } = {}) {
  const st = useStore.getState();
  st.setReplay({ serial, t: d.x[0], playing: true, speed: opts.speed ?? 300 });
  if (opts.follow ?? true) st.setFollow(true);
}
