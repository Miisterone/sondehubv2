import { lazy, Suspense, useMemo, useState } from 'react';
import { Maximize2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { nearestIndex, type FlightData, type Sounding } from '@/lib/flight';
import type { Profile } from '@/lib/atmo';
import type { FlightPhase, Sonde } from '@/lib/types';
import { buildAtmoScene, exaggeration, whereabouts, type AtmoScene } from '@/lib/atmo3d';
import { fmtAlt, fmtAltShort, type Units } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LineKey, Readout } from './ChartParts';
import { IconButton } from './ui';
import { canReplay, startReplay, useReplayDriver } from './ReplayBar';
import { intlTag, t, useT } from '@/i18n';

const Atmosphere3D = lazy(() => import('./Atmosphere3D'));
const SPEED = 600;

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });

function scaleNote(scene: AtmoScene, lower = false): string {
  const k = exaggeration(scene);
  const n = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toLocaleString(intlTag(), { maximumFractionDigits: 1 }));
  if (k >= 1.25) return t(lower ? 'atmo3d.scale.heightsLower' : 'atmo3d.scale.heights', { factor: n(k) });
  if (k <= 0.8) return t(lower ? 'atmo3d.scale.distancesLower' : 'atmo3d.scale.distances', { factor: n(1 / k) });
  return t(lower ? 'atmo3d.scale.sameLower' : 'atmo3d.scale.same');
}

export function AtmospherePanel({
  sonde,
  flight,
  sounding,
  profile,
  units,
  live,
}: {
  sonde: Sonde;
  flight: FlightData;
  sounding: Sounding;
  profile: Profile | null;
  units: Units;
  live: boolean;
}) {
  const t = useT();
  const theme = useStore((s) => s.settings.theme);
  const replay = useStore((s) => (s.replay?.serial === sonde.serial ? s.replay : null));
  const { setReplay } = useStore.getState();
  const [full, setFull] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const scene = useMemo(() => buildAtmoScene(flight, sounding, profile), [flight, sounding, profile]);
  const end = flight.x[Math.max(0, flight.last)] ?? 0;
  useReplayDriver(sonde.serial, end);

  if (!scene) return null;

  const index = replay ? Math.min(flight.last, nearestIndex(flight.x, replay.t)) : null;
  const alt = index !== null ? (flight.alt[index] ?? 0) : sonde.last.alt;
  const phase: FlightPhase = index !== null ? (flight.burst !== null && index > flight.burst ? 'descending' : index === flight.last ? sonde.phase : 'ascending') : sonde.phase;
  const where = whereabouts(alt, scene, phase, (m) => fmtAltShort(m, units));
  const label = t('atmo3d.panel.ariaLabel', { alt: fmtAltShort(alt, units), where: where.caption, tropopause: fmtAltShort(scene.tropopause.z, units) });
  const replayable = canReplay(flight);
  const atEnd = replay ? replay.t >= end : false;

  const view = (mode: 'preview' | 'full') => (
    <Suspense fallback={<div className="bg-surface h-full w-full" />}>
      <Atmosphere3D
        scene={scene}
        flight={flight}
        theme={theme}
        units={units}
        mode={mode}
        index={index}
        live={live && index === null}
        resetKey={mode === 'full' ? resetKey : undefined}
        label={label}
      />
    </Suspense>
  );

  const readout = (
    <Readout
      value={fmtAlt(alt, units)}
      caption={<span className="truncate">{where.caption}</span>}
      aside={
        where.amount && (
          <>
            <div className="text-foreground font-semibold">{where.amount}</div>
            <div>{where.relation}</div>
          </>
        )
      }
    />
  );

  const controls = replay ? (
    <div className="space-y-2">
      <input
        type="range"
        min={flight.x[0]}
        max={end}
        step={1}
        value={Math.round(replay.t)}
        onChange={(e) => setReplay({ ...replay, t: Number(e.target.value) })}
        aria-label={t('atmo3d.panel.positionInFlight')}
        aria-valuetext={t('atmo3d.panel.positionValue', { time: clock(replay.t), alt: fmtAlt(alt, units) })}
        className="accent-primary h-1.5 w-full cursor-pointer"
      />
      <div className="tabular text-faint flex justify-between text-[12px]">
        <span>{clock(flight.x[0])}</span>
        <span className="text-foreground font-semibold">{clock(replay.t)}</span>
        <span>{clock(end)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="text-[13px]"
          onClick={() => (atEnd ? setReplay({ ...replay, t: flight.x[0], playing: true }) : setReplay({ ...replay, playing: !replay.playing }))}
        >
          {atEnd ? <RotateCcw /> : replay.playing ? <Pause /> : <Play />}
          {atEnd ? t('atmo3d.panel.restart') : replay.playing ? t('atmo3d.panel.pause') : t('atmo3d.panel.play')}
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto text-[13px]" onClick={() => setReplay(null)}>
          <X /> {t('atmo3d.panel.quit')}
        </Button>
      </div>
    </div>
  ) : replayable ? (
    <Button variant="outline" size="sm" className="text-[13px]" onClick={() => startReplay(sonde.serial, flight, { speed: SPEED, follow: false })}>
      <Play /> {t('atmo3d.panel.watchCrossing')}
    </Button>
  ) : null;

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
      <span className="flex items-center gap-1.5">
        <LineKey predicted={false} /> {t('atmo3d.legend.measured')}
      </span>
      {flight.forecast && (
        <span className="flex items-center gap-1.5">
          <LineKey predicted /> {t('atmo3d.legend.predicted')}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <svg width="16" height="8" aria-hidden>
          <path d="M0,4 H16" stroke="currentColor" strokeWidth="1.5" strokeDasharray={scene.tropopause.measured ? undefined : '4 3'} className="text-faint" />
        </svg>
        {scene.tropopause.measured ? t('atmo3d.legend.tropopauseMeasured') : t('atmo3d.legend.tropopauseTypical')}
      </span>
      {scene.freezing !== null && (
        <span className="flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <path d="M0,4 H16" stroke="var(--chart-pred)" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          {t('atmo3d.legend.freezing')}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {readout}
      <div className="relative h-[320px] w-full overflow-hidden rounded-md border">
        {!full && view('preview')}
        <IconButton label={t('atmo3d.panel.expand')} side="left" className="bg-background/90 absolute top-2 right-2 border" onClick={() => setFull(true)}>
          <Maximize2 className="size-4" />
        </IconButton>
      </div>
      <p className="text-faint text-[12px]">{t('atmo3d.panel.dragHint', { scale: scaleNote(scene) })}</p>
      {controls}
      {legend}

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-none sm:max-w-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        >
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-heading text-[16px] font-semibold">{t('atmo3d.dialog.title')}</DialogTitle>
              <DialogDescription className="tabular truncate text-[12.5px]">
                {t('atmo3d.dialog.description', { serial: sonde.serial, scale: scaleNote(scene, true) })}
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => setResetKey((k) => k + 1)}>
              <RotateCcw /> {t('atmo3d.dialog.recenter')}
            </Button>
            <DialogClose asChild>
              <IconButton label={t('atmo3d.dialog.close')} side="bottom">
                <X className="size-[18px]" />
              </IconButton>
            </DialogClose>
          </div>
          <div className="relative min-h-0 flex-1">{full && view('full')}</div>
          <div className="mx-auto w-full max-w-2xl shrink-0 space-y-3 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {readout}
            {controls}
            {legend}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
