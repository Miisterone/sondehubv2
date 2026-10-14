import { useEffect, useMemo } from 'react';
import { ArrowDown, ArrowUp, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { replayAt, type FlightData } from '@/lib/flight';
import { fmtAlt, fmtDuration, fmtHSpeed, fmtTemp, fmtVSpeed, type Units } from '@/lib/format';
import { towards } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { Segmented, Stat } from './ui';

const SPEEDS = [60, 300, 1200] as const;
const clock = (s: number) => new Date(s * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function ReplayBar({ serial, d, units }: { serial: string; d: FlightData; units: Units }) {
  const replay = useStore((s) => (s.replay?.serial === serial ? s.replay : null));
  const { setReplay, setFollow } = useStore.getState();
  const start = d.x[0];
  const end = d.x[Math.max(0, d.last)];
  const span = end - start;
  const playing = replay?.playing ?? false;

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

  const point = useMemo(() => (replay ? replayAt(d, replay.t) : null), [d, replay]);

  if (d.last < 2 || span < 120) return null;

  if (!replay || !point) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed">
          Revoyez les {fmtDuration(span * 1000)} de vol mesurés en accéléré : la sonde se déplace sur la carte et les mesures défilent avec elle.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="text-[13px]"
          onClick={() => {
            setReplay({ serial, t: start, playing: true, speed: 300 });
            setFollow(true);
          }}
        >
          <Play /> Rejouer le vol
        </Button>
      </div>
    );
  }

  const atEnd = replay.t >= end;
  const toggle = () => {
    if (atEnd) setReplay({ ...replay, t: start, playing: true });
    else setReplay({ ...replay, playing: !replay.playing });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label="Heure" value={clock(point.t)} sub={`T+${fmtDuration((point.t - start) * 1000)}`} />
        <Stat label="Altitude" value={fmtAlt(point.alt, units)} sub={fmtTemp(point.temp ?? undefined, units)} />
        <Stat
          label="Vitesse verticale"
          value={
            <span className="flex items-center gap-1">
              {point.vv !== null && (point.vv >= 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
              {fmtVSpeed(point.vv ?? undefined, units)}
            </span>
          }
        />
        <Stat
          label="Vitesse horizontale"
          value={fmtHSpeed(point.hs ?? undefined, units)}
          sub={point.hdg !== null && point.hs !== null && point.hs > 1 ? `vers le ${towards(point.hdg)}` : undefined}
        />
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
        <div className="tabular text-faint flex justify-between text-[12px]">
          <span>{clock(start).slice(0, 5)}</span>
          <span>{clock(end).slice(0, 5)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="text-[13px]" onClick={toggle} aria-label={atEnd ? 'Rejouer depuis le début' : playing ? 'Pause' : 'Lecture'}>
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
      <p className="text-[12.5px] leading-relaxed">Sur la carte, le tracé déjà parcouru reste en couleur. Déplacez la carte pour ne plus suivre la sonde.</p>
    </div>
  );
}
