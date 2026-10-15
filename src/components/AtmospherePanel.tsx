import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Maximize2, RotateCcw, X } from 'lucide-react';
import { useStore, type Atmo3dSettings } from '@/store/useStore';
import { nearestIndex, type FlightData, type Sounding } from '@/lib/flight';
import type { Profile } from '@/lib/atmo';
import type { FlightPhase, Sonde } from '@/lib/types';
import { buildAtmoScene, exaggeration, whereabouts, type AtmoOptions, type AtmoScene, type AtmoView } from '@/lib/atmo3d';
import { loadTerrain, type TerrainGrid } from '@/lib/terrainGrid';
import { loadFloorMap, type FloorMap } from '@/lib/floorMap';
import { fmtAlt, fmtAltShort, fmtHSpeed, fmtVSpeed, type Units } from '@/lib/format';
import { compass } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Readout } from './ChartParts';
import { IconButton, Stat } from './ui';
import { useReplayDriver } from './ReplayBar';
import { altCompact } from './atmoFormat';
import { AtmoColumn, AtmoLegend, AtmoOptionsForm, AtmoSteps, AtmoTimeline, ViewSwitch, type AssetState } from './AtmoParts';
import { intlTag, t, useT } from '@/i18n';

const Atmosphere3D = lazy(() => import('./Atmosphere3D'));

function scaleNote(scene: AtmoScene, lower = false): string {
  const k = exaggeration(scene);
  const n = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toLocaleString(intlTag(), { maximumFractionDigits: 1 }));
  if (k >= 1.25) return t(lower ? 'atmo3d.scale.heightsLower' : 'atmo3d.scale.heights', { factor: n(k) });
  if (k <= 0.8) return t(lower ? 'atmo3d.scale.distancesLower' : 'atmo3d.scale.distances', { factor: n(1 / k) });
  return t(lower ? 'atmo3d.scale.sameLower' : 'atmo3d.scale.same');
}

function boundsKey(scene: AtmoScene | null): string {
  if (!scene) return '';
  const b = scene.bounds;
  return [b.north, b.south, b.west, b.east].map((v) => v.toFixed(4)).join(',');
}

function useAtmoAssets(scene: AtmoScene | null, theme: 'light' | 'dark', wantMap: boolean, wantTerrain: boolean) {
  const key = boundsKey(scene);
  const [floor, setFloor] = useState<{ key: string; theme: string; map: FloorMap } | null>(null);
  const [terrain, setTerrain] = useState<{ key: string; grid: TerrainGrid | null; state: AssetState } | null>(null);

  useEffect(() => {
    if (!scene || !wantMap) return;
    let alive = true;
    loadFloorMap(scene.bounds, theme)
      .then((map) => {
        if (alive) setFloor({ key, theme, map });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, theme, wantMap]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scene || !wantTerrain) return;
    let alive = true;
    setTerrain((prev) => (prev?.key === key ? prev : { key, grid: prev?.grid ?? null, state: 'loading' }));
    loadTerrain(scene.bounds)
      .then((grid) => {
        if (alive) setTerrain({ key, grid, state: 'ready' });
      })
      .catch(() => {
        if (alive) setTerrain({ key, grid: null, state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [key, wantTerrain]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    floor: wantMap && floor && floor.theme === theme ? floor.map : null,
    terrain: wantTerrain && terrain?.key === key ? terrain.grid : null,
    terrainState: (wantTerrain ? (terrain?.key === key ? terrain.state : 'loading') : 'off') as AssetState,
  };
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
  const tr = useT();
  const theme = useStore((s) => s.settings.theme);
  const settings = useStore((s) => s.settings.atmo3d);
  const replay = useStore((s) => (s.replay?.serial === sonde.serial ? s.replay : null));
  const [full, setFull] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const scene = useMemo(() => buildAtmoScene(flight, sounding, profile), [flight, sounding, profile]);
  const end = flight.x[Math.max(0, flight.last)] ?? 0;
  useReplayDriver(sonde.serial, end);
  const view = settings.view;
  const assets = useAtmoAssets(scene, theme, settings.map, settings.terrain || view === 'profile');
  const options = useMemo<AtmoOptions>(
    () => ({ terrain: settings.terrain, map: settings.map, wallShadow: settings.wallShadow, dropLines: settings.dropLines }),
    [settings.terrain, settings.map, settings.wallShadow, settings.dropLines],
  );

  if (!scene) return null;

  const update = (patch: Partial<Atmo3dSettings>) => {
    const st = useStore.getState();
    st.setSettings({ atmo3d: { ...st.settings.atmo3d, ...patch } });
  };
  const setView = (v: AtmoView) => update({ view: v });

  const index = replay ? Math.min(flight.last, nearestIndex(flight.x, replay.t)) : null;
  const i = index ?? flight.last;
  const alt = index !== null ? (flight.alt[index] ?? 0) : sonde.last.alt;
  const phase: FlightPhase = index !== null ? (flight.burst !== null && index > flight.burst ? 'descending' : index === flight.last ? sonde.phase : 'ascending') : sonde.phase;
  const where = whereabouts(alt, scene, phase, (m) => fmtAltShort(m, units));
  const label = tr('atmo3d.panel.ariaLabel', { alt: fmtAltShort(alt, units), where: where.caption, tropopause: fmtAltShort(scene.tropopause.z, units) });
  const current = replay ? replay.t : scene.times.now;
  const replaying = replay !== null;
  const section = view === 'profile' && assets.terrain !== null;

  const view3d = (mode: 'preview' | 'full') => (
    <Suspense fallback={<div className="bg-surface h-full w-full" />}>
      <Atmosphere3D
        scene={scene}
        flight={flight}
        theme={theme}
        units={units}
        mode={mode}
        view={view}
        options={options}
        floor={assets.floor}
        terrain={assets.terrain}
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
      caption={<span>{where.caption}</span>}
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

  const vv = flight.vv[i];
  const hs = flight.hs[i];
  const hdg = flight.hdg[i];
  const stats = (
    <div className="grid grid-cols-2 gap-4">
      <Stat label={tr('atmo3d.stats.vertical')} value={fmtVSpeed(vv ?? undefined, units)} />
      {scene.landingAlt !== null && index === null ? (
        <Stat label={tr('atmo3d.stats.landingGround')} value={fmtAlt(scene.landingAlt, units)} />
      ) : (
        <Stat label={tr('atmo3d.stats.drift')} value={fmtHSpeed(hs ?? undefined, units)} sub={hdg !== null && hs !== null && hs > 1 ? tr('sonde.common.towards', { direction: compass(hdg) }) : undefined} />
      )}
    </div>
  );

  const hint =
    view === 'persp'
      ? tr('atmo3d.panel.dragHint', { scale: scaleNote(scene) })
      : view === 'profile'
        ? tr('atmo3d.view.profileHint', { scale: scaleNote(scene, true) })
        : tr('atmo3d.view.topHint');

  const optionsForm = <AtmoOptionsForm settings={settings} onChange={update} terrainState={assets.terrainState} units={units} />;

  return (
    <div className="space-y-4">
      {readout}
      <ViewSwitch value={view} onChange={setView} stretch />
      <div className="space-y-2">
        <div className="relative h-[280px] w-full overflow-hidden rounded-lg border">
          {!full && view3d('preview')}
          <IconButton label={tr('atmo3d.panel.expand')} side="left" className="bg-background hover:bg-background absolute top-2 right-2 size-10 border" onClick={() => setFull(true)}>
            <Maximize2 className="size-4" />
          </IconButton>
        </div>
        <p className="text-faint text-[12px] leading-relaxed">{hint}</p>
      </div>
      <AtmoTimeline serial={sonde.serial} flight={flight} scene={scene} phase={sonde.phase} compact />
      <AtmoSteps scene={scene} flight={flight} units={units} phase={sonde.phase} current={current} />
      <AtmoLegend scene={scene} forecast={flight.forecast} replaying={replaying} section={section} />

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-none sm:max-w-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 lg:px-6">
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-heading text-[18px] font-semibold">{tr('atmo3d.dialog.title')}</DialogTitle>
              <DialogDescription className="tabular truncate text-[13px]">{tr('atmo3d.dialog.description', { serial: sonde.serial, scale: scaleNote(scene, true) })}</DialogDescription>
            </div>
            <div className="order-last w-full sm:order-none sm:w-auto">
              <ViewSwitch value={view} onChange={setView} />
            </div>
            <Button variant="outline" size="sm" className="text-[13px]" onClick={() => setResetKey((k) => k + 1)}>
              <RotateCcw /> {tr('atmo3d.dialog.recenter')}
            </Button>
            <DialogClose asChild>
              <IconButton label={tr('atmo3d.dialog.close')} side="bottom">
                <X className="size-[18px]" />
              </IconButton>
            </DialogClose>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="hidden w-[340px] shrink-0 space-y-5 overflow-y-auto border-r p-6 lg:block">
              <div className="space-y-3">
                {readout}
                {stats}
              </div>
              <section className="space-y-3">
                <div>
                  <h3 className="font-heading text-foreground text-[15px] font-semibold">{tr('atmo3d.column.title')}</h3>
                  <p className="text-faint text-[12px]">{tr('atmo3d.column.caption', { top: altCompact(scene.top, units) })}</p>
                </div>
                <div className="pt-2">
                  <AtmoColumn scene={scene} units={units} alt={alt} replaying={replaying} height={260} />
                </div>
              </section>
              {optionsForm}
            </aside>
            <div className="relative min-h-0 flex-1">
              {full && view3d('full')}
              <p className="text-faint atmo-label pointer-events-none absolute top-3 left-4 text-[12px]">{view === 'persp' ? tr('atmo3d.view.fullHint') : tr('atmo3d.view.flatHint')}</p>
            </div>
            <div className="shrink-0 overflow-y-auto border-t px-4 py-3 lg:hidden">{optionsForm}</div>
          </div>

          <div className="shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-6 lg:py-4">
            <div className="lg:hidden">
              <AtmoTimeline serial={sonde.serial} flight={flight} scene={scene} phase={sonde.phase} compact />
            </div>
            <div className="hidden lg:block">
              <AtmoTimeline serial={sonde.serial} flight={flight} scene={scene} phase={sonde.phase} compact={false} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
