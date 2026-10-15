import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BatteryMedium,
  ChevronDown,
  Compass,
  Copy,
  Crosshair,
  Droplets,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  Gauge,
  Hash,
  LocateFixed,
  PackageCheck,
  Play,
  Radio,
  Ruler,
  Satellite,
  Share2,
  Star,
  Thermometer,
  Timer,
  Wind,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { ago, fmtAlt, fmtAltShort, fmtClock, fmtCoord, fmtDateTime, fmtDist, fmtFreq, fmtHSpeed, fmtNum, fmtTemp, fmtVSpeed, relative, type Units } from '@/lib/format';
import type { Prediction, PredictionPoint, Sonde } from '@/lib/types';
import { bearing, cardinal, compass, distance, elevation, towards } from '@/lib/geo';
import { buildFlight, buildSounding } from '@/lib/flight';
import { flightInsights } from '@/lib/insights';
import { buildProfile } from '@/lib/atmo';
import { downloadCSV, downloadKML } from '@/lib/export';
import { usefulPrediction } from '@/lib/filter';
import { findLaunch, fmtHour, siteLabel, type Launch } from '@/lib/sonde';
import { TrackLegend } from './TrackLegend';
import { basemapById } from '@/lib/basemaps';
import { PHASE_LABEL } from '@/lib/icons';
import { GroundTrack } from './GroundTrack';
import { FlightTimeline } from './FlightTimeline';
import { ReplayControls, ReplayStats, canReplay, startReplay } from './ReplayBar';
import { AtmoIndices } from './AtmoIndices';
import { AtmospherePanel } from './AtmospherePanel';
import { IconButton, PhaseBadge, Section, Segmented, Stat, cx } from './ui';
import { AltitudeColumn, Icon3D } from './Icon3D';
import { HELP, HelpHint } from './HelpHint';
import { RecoveryDialog } from './RecoveryDialog';
import { NavMenu } from './NavMenu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { intlTag, t, Trans, useT } from '@/i18n';

const charts = () => import('./FlightCharts');
const AltitudeChart = lazy(() => charts().then((m) => ({ default: m.AltitudeChart })));
const SpeedChart = lazy(() => charts().then((m) => ({ default: m.SpeedChart })));
const ProfileChart = lazy(() => charts().then((m) => ({ default: m.ProfileChart })));
const SoundingCharts = lazy(() => charts().then((m) => ({ default: m.SoundingCharts })));
const FlightTable = lazy(() => charts().then((m) => ({ default: m.FlightTable })));
const SkewT = lazy(() => import('./SkewT').then((m) => ({ default: m.SkewT })));
const WindProfile = lazy(() => import('./WindProfile').then((m) => ({ default: m.WindProfile })));
const PredictionConvergence = lazy(() => import('./PredictionConvergence').then((m) => ({ default: m.PredictionConvergence })));

const RECEIVERS_PREVIEW = 8;

type DetailTab = 'flight' | 'atmosphere' | 'technical';
type ChartView = 'altitude' | 'speed' | 'distance';

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  {
    id: 'flight',
    get label() {
      return t('sonde.tabs.flight');
    },
  },
  {
    id: 'atmosphere',
    get label() {
      return t('sonde.tabs.atmosphere');
    },
  },
  {
    id: 'technical',
    get label() {
      return t('sonde.tabs.technical');
    },
  },
];

const TAB_KEY = 'sondetrack.detailTab.v1';

function readTab(): DetailTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return v === 'atmosphere' || v === 'technical' ? v : 'flight';
  } catch {
    return 'flight';
  }
}

function writeTab(v: DetailTab) {
  try {
    localStorage.setItem(TAB_KEY, v);
  } catch {
    return;
  }
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error(t('sonde.copy.error'));
  }
}

export function SondeDetail({ serial }: { serial: string }) {
  const t = useT();
  const sonde = useStore((s) => s.sondes[serial]);
  const prediction = useStore((s) => s.predictions[serial]);
  const units = useStore((s) => s.settings.units);
  const follow = useStore((s) => s.follow);
  const me = useStore((s) => s.userLocation);
  const listeners = useStore((s) => s.listeners);
  const now = useStore((s) => s.now);
  const sites = useStore((s) => s.sites);
  const reverse = useStore((s) => s.reverse[serial]);
  const darkBase = useStore((s) => basemapById(s.settings.basemap).dark);
  const favourite = useStore((s) => s.settings.favourites.includes(serial));
  const recovery = useStore((s) => s.recoveries[serial]);
  const predHistory = useStore((s) => s.predHistory[serial]);
  const replaying = useStore((s) => s.replay?.serial === serial);
  const missing = useStore((s) => s.missing === serial);
  const { select, selectSite, selectListener, setFollow, requestFly, toggleFavourite } = useStore.getState();
  const [allReceivers, setAllReceivers] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [tab, setTab] = useState<DetailTab>(readTab);
  const [chartView, setChartView] = useState<ChartView>('altitude');
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [hero, setHero] = useState<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const tabAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, [hero]);

  const launch = useMemo(
    () => (sonde ? findLaunch(sonde, sites, reverse) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sonde?.track[0], sites, reverse],
  );

  const flight = useMemo(
    () => (sonde ? buildFlight(sonde, usefulPrediction(sonde, prediction) ? prediction : null) : null),
    [sonde?.track.length, sonde?.lastTime, sonde?.phase, sonde?.maxAltIdx, sonde?.detailed, prediction],
  );
  const sounding = useMemo(
    () => (sonde ? buildSounding(sonde) : { alt: [], temp: [], hum: [] }),
    [sonde?.track.length, sonde?.maxAltIdx, sonde?.detailed],
  );
  const profile = useMemo(
    () => (sonde ? buildProfile(sonde) : null),
    [sonde?.track.length, sonde?.maxAltIdx, sonde?.detailed],
  );
  const insights = useMemo(
    () => (sonde && flight ? flightInsights(sonde, sounding, flight, units) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sonde?.phase, sonde?.maxAlt, sounding, flight, units, t],
  );

  if (!sonde || !flight) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <IconButton label={t('sonde.header.back')} side="bottom" onClick={() => select(null)}>
            <ArrowLeft />
          </IconButton>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="tabular truncate text-[16px] font-semibold">{serial}</h2>
            {!missing && <Skeleton className="bg-surface h-3 w-32" />}
          </div>
        </div>
        {missing ? (
          <div className="space-y-3 px-5 py-6">
            <p className="text-foreground text-[15px] font-semibold">{t('sonde.header.notFoundTitle')}</p>
            <p className="max-w-80 text-[13.5px] leading-relaxed">{t('sonde.header.notFoundText', { serial })}</p>
            <Button variant="outline" size="sm" className="text-[13px]" onClick={() => select(null)}>
              <ArrowLeft /> {t('sonde.header.back')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5" role="status" aria-live="polite">
            <p className="text-[13px]">{t('sonde.header.loading')}</p>
            <Skeleton className="bg-surface h-10 w-40" />
            <Skeleton className="bg-surface h-28 w-full rounded-lg" />
          </div>
        )}
      </div>
    );
  }

  const f = sonde.last;
  const vv = f.vel_v;
  const useful = usefulPrediction(sonde, prediction);
  const landing = useful ? prediction.landing : null;
  const flying = sonde.phase === 'ascending' || sonde.phase === 'descending';
  const target = landing ? { lat: landing.lat, lon: landing.lon } : { lat: f.lat, lon: f.lon };
  const fromMe = me ? { d: distance(me.lat, me.lon, target.lat, target.lon), b: bearing(me.lat, me.lon, target.lat, target.lon) } : null;
  const meToSonde = me
    ? { d: distance(me.lat, me.lon, f.lat, f.lon), az: bearing(me.lat, me.lon, f.lat, f.lon), el: elevation(me.lat, me.lon, me.alt ?? 0, f.lat, f.lon, f.alt) }
    : null;
  const model = [sonde.manufacturer, sonde.type].filter((v, i, a) => v && a.indexOf(v) === i).join(' ');
  const burstAlt = sonde.phase !== 'ascending' && sonde.maxAlt - f.alt > 500 ? sonde.maxAlt : null;
  const columnMark = burstAlt ?? (sonde.phase === 'ascending' && useful && prediction.burstAltitude > f.alt ? prediction.burstAltitude : null);
  const receivers = Object.values(sonde.receivers).sort((a, b) => b.lastHeard - a.lastHeard);
  const live = now - sonde.lastTime < 60_000;
  const falling = vv !== undefined && vv < -0.5;
  const recoverable = sonde.phase === 'landed' || sonde.phase === 'lost' || (sonde.phase === 'descending' && f.alt < 3000);
  const showLanding = landing || sonde.phase === 'landed' || sonde.phase === 'lost';
  const syncKey = `vol-${sonde.serial}`;
  const hasSounding = sounding.alt.length > 1;
  const launchPt = flight.x.length ? { lat: flight.lat[0], lon: flight.lon[0] } : null;
  const toLanding = landing ? distance(f.lat, f.lon, landing.lat, landing.lon) : null;
  const drift = launchPt ? distance(launchPt.lat, launchPt.lon, f.lat, f.lon) : 0;

  const history = predHistory ?? [];
  const lastStep =
    history.length > 1
      ? distance(history[history.length - 2].lat, history[history.length - 2].lon, history[history.length - 1].lat, history[history.length - 1].lon)
      : null;
  const evolutionText =
    lastStep !== null
      ? t('sonde.evolution.lastCorrection', { distance: fmtDist(lastStep, units), ago: ago(history[history.length - 1].at, now) })
      : t('sonde.evolution.building');

  const toggleFav = () => {
    toggleFavourite(sonde.serial);
    toast(favourite ? t('sonde.favourite.removedToast') : t('sonde.favourite.addedToast'), { id: 'fav' });
  };

  const receiverList = (limit: number | null) => (
    <ul className="divide-y rounded-md border">
      {(limit === null ? receivers : receivers.slice(0, limit)).map((r) => {
        const pos = r.position ?? (listeners[r.callsign] ? [listeners[r.callsign].lat, listeners[r.callsign].lon] : undefined);
        const d = pos ? distance(pos[0], pos[1], f.lat, f.lon) : undefined;
        const fresh = sonde.lastTime - r.lastHeard < 60_000;
        return (
          <li key={r.callsign}>
            <button
              type="button"
              onClick={() => selectListener(r.callsign, true)}
              className="hover:bg-surface focus-visible:ring-ring/50 flex w-full items-center gap-3 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
            <Icon3D id={listeners[r.callsign]?.mobile ? 'chase' : 'station'} size={30} className={cx('-my-1', fresh ? '' : 'opacity-40 grayscale')} />
            <div className="min-w-0 flex-1">
              <div className="text-foreground truncate text-[13px] font-semibold">{r.callsign}</div>
              <div className="text-faint truncate text-[12px]">
                {ago(r.lastHeard, now)}
                {d !== undefined ? ` · ${t('sonde.receivers.distance', { distance: fmtDist(d, units) })}` : ''}
                {r.software ? ` · ${r.software}` : ''}
              </div>
            </div>
            {r.snr !== undefined && <SnrBar snr={r.snr} />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const selectTab = (id: DetailTab) => {
    setTab(id);
    writeTab(id);
    const anchor = tabAnchor.current;
    const viewport = anchor?.closest('[data-slot=scroll-area-viewport]') as HTMLElement | null;
    if (!anchor || !viewport) return;
    const offset = anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    if (offset < 0) viewport.scrollTop += offset;
  };

  const vSpeed = (
    <>
      {vv !== undefined && (vv >= 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
      {fmtVSpeed(vv, units)}
    </>
  );

  return (
    <div className="animate-in flex h-full min-h-0 flex-col">
      <div className={cx('flex shrink-0 items-center border-b px-3', compact ? 'gap-1.5 py-2' : 'gap-2 py-3')}>
        <IconButton label={t('sonde.header.back')} side="bottom" onClick={() => select(null)}>
          <ArrowLeft />
        </IconButton>
        {!compact && <Icon3D id={sonde.phase} size={38} className="-my-1.5" />}
        <div className="ml-0.5 min-w-0 flex-1">
          <h2 className={cx('tabular truncate leading-tight font-semibold', compact ? 'text-[15px]' : 'text-[16px]')}>{sonde.serial}</h2>
          {compact ? (
            <div className="flex items-center gap-1.5 truncate text-[12px]">
              <span className={cx('relative size-1.5 shrink-0 rounded-full', live ? 'live-dot bg-live' : 'bg-faint')} />
              <span className="truncate">{PHASE_LABEL[sonde.phase]}</span>
            </div>
          ) : (
            <div className="truncate text-[12.5px]">{model || t('sonde.header.defaultModel')}</div>
          )}
        </div>
        {compact ? (
          <div className="tabular shrink-0 pr-1 text-right">
            <div className="font-heading text-foreground text-[16px] leading-tight font-semibold">{fmtAlt(f.alt, units)}</div>
            <div className="flex items-center justify-end gap-0.5 text-[11.5px] whitespace-nowrap">
              {vSpeed} · {fmtHSpeed(f.vel_h, units)}
            </div>
          </div>
        ) : (
          <>
            <IconButton label={t('sonde.header.center')} side="bottom" onClick={() => requestFly(f.lon, f.lat, 11)}>
              <Crosshair className="size-[18px]" />
            </IconButton>
            <IconButton label={t('sonde.header.share')} side="bottom" onClick={() => share(sonde, landing, now, units)}>
              <Share2 className="size-[18px]" />
            </IconButton>
          </>
        )}
        <IconButton label={follow ? t('sonde.header.unfollow') : t('sonde.header.follow')} side="bottom" active={follow} onClick={() => setFollow(!follow)}>
          <LocateFixed className="size-[18px]" />
        </IconButton>
        <IconButton
          label={favourite ? t('sonde.header.unfavourite') : t('sonde.header.favourite')}
          side="bottom"
          className={cx(favourite && 'text-foreground')}
          aria-pressed={favourite}
          onClick={toggleFav}
        >
          <Star className={cx('size-[18px]', favourite && 'fill-current')} />
        </IconButton>
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div ref={setHero} className="space-y-5 px-5 pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PhaseBadge phase={sonde.phase} />
            <span className="flex items-center gap-2 text-[12.5px]">
              <span className={cx('relative size-2 shrink-0 rounded-full', live ? 'live-dot bg-live' : 'bg-faint')} />
              {sonde.archived
                ? t('sonde.status.archived', { date: fmtDateTime(sonde.track[0]?.[3] ?? sonde.lastTime) })
                : live
                  ? t('sonde.status.live', { ago: ago(sonde.lastTime, now) })
                  : t('sonde.status.lastSignal', { ago: ago(sonde.lastTime, now) })}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px]">{t('sonde.common.altitude')}</div>
              <div className="font-heading tabular text-foreground text-[36px] leading-none font-semibold">{fmtAlt(f.alt, units)}</div>
              <div className="mt-1.5 flex items-center gap-1 text-[12.5px]">
                <span className="min-w-0 truncate">
                  {burstAlt
                    ? t('sonde.hero.burstAt', { alt: fmtAltShort(burstAlt, units) })
                    : sonde.phase === 'ascending' && useful && prediction.burstAltitude > f.alt
                      ? t('sonde.hero.burstForecast', { alt: fmtAltShort(prediction.burstAltitude, units) })
                      : t('sonde.hero.maxReached', { alt: fmtAltShort(sonde.maxAlt, units) })}
                </span>
                <HelpHint title={burstAlt || sonde.phase === 'ascending' ? HELP.burst.title : HELP.maxAlt.title}>
                  {burstAlt || sonde.phase === 'ascending' ? HELP.burst.text : HELP.maxAlt.text}
                </HelpHint>
              </div>
            </div>
            <AltitudeColumn
              alt={f.alt}
              burst={columnMark}
              className="-my-2"
              label={columnMark === null ? t('sonde.hero.columnLabel', { alt: fmtAltShort(f.alt, units) }) : t(burstAlt ? 'sonde.hero.columnLabelBurst' : 'sonde.hero.columnLabelBurstForecast', { alt: fmtAltShort(f.alt, units), burst: fmtAltShort(columnMark, units) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[12.5px]">
                <span className="truncate">{flying ? (falling ? t('sonde.hero.fallSpeed') : t('sonde.hero.climbSpeed')) : t('sonde.hero.verticalSpeed')}</span>
                <HelpHint title={HELP.vspeed.title}>{HELP.vspeed.text}</HelpHint>
              </div>
              <div className="font-heading tabular text-foreground mt-0.5 flex items-center gap-1 text-[22px] leading-tight font-semibold">
                {vv !== undefined && (vv >= 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />)}
                {fmtVSpeed(vv, units)}
              </div>
              <div className="text-faint truncate text-[12px]">{flying ? (falling ? t('sonde.hero.underParachute') : t('sonde.hero.carriedByBalloon')) : t('sonde.hero.lastMeasure')}</div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[12.5px]">
                <span className="truncate">{t('sonde.hero.horizontalSpeed')}</span>
                <HelpHint title={HELP.hspeed.title} align="end">
                  {HELP.hspeed.text}
                </HelpHint>
              </div>
              <div className="font-heading tabular text-foreground mt-0.5 text-[22px] leading-tight font-semibold">{fmtHSpeed(f.vel_h, units)}</div>
              <div className="text-faint truncate text-[12px]">{f.heading !== undefined ? t('sonde.common.towards', { direction: towards(f.heading) }) : t('sonde.hero.pushedByWind')}</div>
            </div>
          </div>

          <p className="text-[13.5px] leading-relaxed">{summarise(sonde, launch, landing, prediction, now, units)}</p>

          {recovery && (
            <div className="flex gap-3 rounded-md border px-3 py-2.5 text-[13px] leading-snug">
              <PackageCheck className="text-foreground mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <div className="text-foreground font-semibold">
                  {recovery.recoveredBy
                    ? recovery.recovered
                      ? t('sonde.recovery.recoveredBy', { name: recovery.recoveredBy })
                      : t('sonde.recovery.searchingBy', { name: recovery.recoveredBy })
                    : recovery.recovered
                      ? t('sonde.recovery.recovered')
                      : t('sonde.recovery.searching')}
                  <span className="font-normal"> · {ago(recovery.datetime, now)}</span>
                </div>
                {recovery.description && <div className="line-clamp-3 break-words">{t('sonde.recovery.quote', { text: recovery.description })}</div>}
              </div>
            </div>
          )}
        </div>

        <div ref={tabAnchor} />
        <div
          role="tablist"
          aria-label={t('sonde.tabs.ariaLabel')}
          className="bg-background sticky top-0 z-10 flex gap-6 border-b px-5"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const i = DETAIL_TABS.findIndex((x) => x.id === tab);
            const next = DETAIL_TABS[(i + (e.key === 'ArrowRight' ? 1 : DETAIL_TABS.length - 1)) % DETAIL_TABS.length].id;
            selectTab(next);
            (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
          }}
        >
          {DETAIL_TABS.map((x) => {
            const on = tab === x.id;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`detail-tab-${x.id}`}
                data-tab={x.id}
                aria-selected={on}
                aria-controls="detail-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => selectTab(x.id)}
                className={cx(
                  'focus-visible:ring-ring/50 -mb-px rounded-t-sm border-b-2 pt-2.5 pb-3 text-[14px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
                  on ? 'border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground border-transparent font-normal',
                )}
              >
                {x.label}
              </button>
            );
          })}
        </div>

        <div id="detail-panel" role="tabpanel" aria-labelledby={`detail-tab-${tab}`} className="space-y-8 px-5 pt-6 pb-10">
          {tab === 'flight' && (
            <>
              <Section
                title={
                  <>
                    {t('sonde.charts.title')}
                    <HelpHint title={t('sonde.charts.helpTitle')}>{t('sonde.charts.helpText')}</HelpHint>
                  </>
                }
              >
                <Segmented<ChartView>
                  size="sm"
                  value={chartView}
                  onChange={setChartView}
                  className="w-full [&>*]:flex-1"
                  options={[
                    { value: 'altitude', label: t('sonde.common.altitude'), title: t('sonde.charts.altitudeTitle') },
                    { value: 'speed', label: t('sonde.common.speed'), title: t('sonde.charts.speedTitle') },
                    { value: 'distance', label: t('sonde.common.distance'), title: t('sonde.charts.distanceTitle') },
                  ]}
                />
                <Suspense fallback={<div className="h-[318px]" />}>
                  {chartView === 'altitude' && <AltitudeChart d={flight} units={units} now={now} live={live} syncKey={syncKey} />}
                  {chartView === 'speed' && <SpeedChart d={flight} units={units} now={now} live={live} syncKey={syncKey} />}
                  {chartView === 'distance' && <ProfileChart d={flight} units={units} now={now} live={live} />}
                  <FlightTable d={flight} units={units} />
                </Suspense>
              </Section>

              <Section
                title={
                  <>
                    {t('sonde.trajectory.title')}
                    <HelpHint title={HELP.trajectory.title}>{HELP.trajectory.text}</HelpHint>
                  </>
                }
                className="border-t pt-6"
              >
                {replaying ? (
                  <ReplayStats serial={sonde.serial} d={flight} units={units} />
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <Stat label={t('sonde.trajectory.travelled')} value={fmtDist(flight.path[flight.last] ?? 0, units)} sub={t('sonde.trajectory.sinceLaunch')} />
                    {toLanding !== null && flying ? (
                      <Stat label={t('sonde.trajectory.remaining')} value={fmtDist(toLanding, units)} sub={t('sonde.trajectory.beforeLanding')} />
                    ) : (
                      <Stat label={t('sonde.trajectory.fromLaunch')} value={fmtDist(drift, units)} sub={t('sonde.trajectory.asTheCrowFlies')} />
                    )}
                    <Stat
                      label={t('sonde.common.heading')}
                      value={f.heading !== undefined ? `${Math.round(f.heading)}°` : '—'}
                      sub={f.heading !== undefined ? t('sonde.common.towards', { direction: compass(f.heading) }) : undefined}
                    />
                  </div>
                )}
                <GroundTrack d={flight} units={units} now={now} live={live} serial={sonde.serial} />
                {replaying ? (
                  <ReplayControls serial={sonde.serial} d={flight} units={units} />
                ) : (
                  canReplay(flight) && (
                    <Button variant="outline" size="sm" className="text-[13px]" onClick={() => startReplay(sonde.serial, flight)}>
                      <Play /> {t('sonde.trajectory.replay')}
                    </Button>
                  )
                )}
                <TrackLegend
                  units={units}
                  darkBase={darkBase}
                  alt={f.alt}
                  live={live && flying}
                  showPrediction={useful && flying && !!prediction?.path && prediction.path.length > 1}
                  showReverse={!!reverse && (sonde.track[0]?.[2] ?? 0) >= 3000}
                />
              </Section>

              <Section
                title={
                  <>
                    {useful && flying ? t('sonde.forecast.title') : t('sonde.forecast.flightTitle')}
                    <HelpHint title={HELP.prediction.title}>{HELP.prediction.text}</HelpHint>
                  </>
                }
                className="border-t pt-6"
              >
                <FlightTimeline d={flight} phase={sonde.phase} prediction={useful ? prediction : null} units={units} now={now} launch={launch} />
                {launch?.estimated && (
                  <p className="text-[12.5px] leading-relaxed">
                    {t('sonde.launch.firstHeard', { alt: fmtAltShort(sonde.track[0][2], units) })}{' '}
                    {launch.site
                      ? t('sonde.launch.estimatedFromSite', { hour: fmtHour(launch.t), site: siteLabel(launch.site) })
                      : launch.near
                        ? t('sonde.launch.estimatedNearSite', {
                            hour: fmtHour(launch.t),
                            distance: fmtDist(launch.near.d, units),
                            direction: cardinal(launch.near.bearing),
                            site: siteLabel(launch.near.site),
                          })
                        : t('sonde.launch.estimated', { hour: fmtHour(launch.t) })}{' '}
                    {t('sonde.launch.dashedTrack')}
                  </p>
                )}
                {launch?.siteId && launch.site && (
                  <Button variant="link" size="xs" className="-ml-2 h-auto text-[13px] font-normal" onClick={() => selectSite(launch.siteId, true)}>
                    {t('sonde.launch.viewSite', { site: siteLabel(launch.site) })}
                  </Button>
                )}

                {showLanding && (
                  <div className="space-y-3 rounded-lg border px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <Icon3D id={landing ? 'landing' : sonde.phase === 'lost' ? 'lost' : 'landed'} size={36} className="-mt-1.5 -ml-1" />
                      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                        <div className="text-foreground flex items-center gap-1.5 font-semibold">
                          <span className="truncate">
                            {landing
                              ? flying
                                ? t('sonde.landing.predictedWhen', { when: relative(landing.time * 1000, now) })
                                : t('sonde.landing.estimated')
                              : sonde.phase === 'landed'
                                ? t('sonde.landing.onGround')
                                : t('sonde.landing.lastKnown')}
                          </span>
                          {landing ? (
                            <HelpHint title={HELP.landing.title}>{HELP.landing.text}</HelpHint>
                          ) : sonde.phase === 'lost' ? (
                            <HelpHint title={HELP.lost.title}>{HELP.lost.text}</HelpHint>
                          ) : null}
                        </div>
                        <div>
                          {landing && flying && t('sonde.landing.around', { time: fmtClock(landing.time * 1000).slice(0, 5) })}
                          {landing && !flying && (
                            t('sonde.landing.signalLost', { alt: fmtAltShort(f.alt, units), ago: ago(sonde.lastTime, now) })
                          )}
                          {!landing && ago(sonde.lastTime, now)}
                          {fromMe && <> · {t('sonde.landing.fromYou', { distance: fmtDist(fromMe.d, units), direction: towards(fromMe.b) })}</>}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="tabular text-muted-foreground hover:text-foreground -ml-2 text-[12.5px] font-normal"
                              onClick={() => copyText(`${target.lat.toFixed(5)}, ${target.lon.toFixed(5)}`, t('sonde.landing.coordsCopied'))}
                            >
                              {fmtCoord(target.lat, target.lon)}
                              <Copy />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{t('sonde.landing.copyCoords')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="text-[13px]" onClick={() => requestFly(target.lon, target.lat, 12)}>
                        <Crosshair /> {t('sonde.landing.showOnMap')}
                      </Button>
                      <NavMenu target={target} heading={landing ? t('sonde.landing.routeToLanding') : t('sonde.landing.routeToSonde')} className="text-[13px]" />
                      {recoverable && (
                        <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => setReporting(true)}>
                          <PackageCheck /> {t('sonde.landing.found')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {(flying || history.length > 1) && (
                  <div className="border-t">
                    <button
                      type="button"
                      aria-expanded={evolutionOpen}
                      aria-controls="prediction-evolution"
                      onClick={() => setEvolutionOpen((v) => !v)}
                      className="focus-visible:ring-ring/50 flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block text-[13.5px] font-semibold">{t('sonde.evolution.title')}</span>
                        <span className="block truncate text-[12.5px]">{evolutionText}</span>
                      </span>
                      <ChevronDown className={cx('text-muted-foreground size-5 shrink-0 transition-transform', evolutionOpen && 'rotate-180')} />
                    </button>
                    {evolutionOpen && (
                      <div id="prediction-evolution" className="pb-2">
                        <Suspense fallback={<div className="h-[260px]" />}>
                          <PredictionConvergence sonde={sonde} samples={history} units={units} now={now} />
                        </Suspense>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {!showLanding && (
                <Button variant="link" size="xs" className="-ml-2 h-auto text-[13px] font-normal" onClick={() => setReporting(true)}>
                  {t('sonde.landing.reportFound')}
                </Button>
              )}
            </>
          )}

          {tab === 'atmosphere' && (
            <>
              {flight.last >= 1 && (
                <Section
                  title={
                    <>
                      {t('sonde.view3d.title')}
                      <HelpHint title={t('sonde.view3d.helpTitle')}>{t('sonde.view3d.helpText')}</HelpHint>
                    </>
                  }
                >
                  <AtmospherePanel sonde={sonde} flight={flight} sounding={sounding} profile={profile} units={units} live={live} />
                </Section>
              )}

              <Section title={t('sonde.atmo.measurements')} right={<HelpHint title={HELP.sensors.title} align="end">{HELP.sensors.text}</HelpHint>} className={cx(flight.last >= 1 && 'border-t pt-6')}>
                <div className="grid grid-cols-3 gap-4">
                  <Stat icon={<Thermometer />} label={t('sonde.atmo.temperature')} value={fmtTemp(f.temp, units)} sub={t('sonde.common.ofAir')} />
                  <Stat icon={<Droplets />} label={t('sonde.atmo.humidity')} value={fmtNum(f.humidity, ' %', 0)} sub={t('sonde.common.ofAir')} />
                  <Stat icon={<Gauge />} label={t('sonde.common.pressure')} value={fmtNum(f.pressure, ' hPa', 0)} sub={pressureSub(f.pressure)} />
                </div>
                {insights.length > 0 && (
                  <ul className="divide-y rounded-md border">
                    {insights.map((x) => (
                      <li key={x.id} className="px-4 py-3">
                        <div className="text-foreground text-[13.5px] font-semibold">{x.title}</div>
                        <p className="mt-0.5 text-[13px] leading-relaxed">{x.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {!profile && hasSounding && (
                  <Suspense fallback={<div className="h-[340px]" />}>
                    <SoundingCharts s={sounding} units={units} syncKey={`sondage-${sonde.serial}`} />
                  </Suspense>
                )}
              </Section>

              {profile ? (
                <Section
                  title={
                    <>
                      {t('sonde.atmo.skewTTitle')}
                      <HelpHint title={t('sonde.atmo.skewTHelpTitle')}>{t('sonde.atmo.skewTHelpText')}</HelpHint>
                    </>
                  }
                  className="border-t pt-6"
                >
                  <Suspense fallback={<div className="h-[440px]" />}>
                    <SkewT profile={profile} units={units} />
                  </Suspense>
                  <AtmoIndices profile={profile} units={units} />
                </Section>
              ) : (
                <p className="border-t pt-6 text-[13px] leading-relaxed">
                  {t('sonde.atmo.skewTPending')}
                </p>
              )}

              {profile && profile.winds.length >= 6 && (
                <Section
                  title={
                    <>
                      {t('sonde.atmo.windTitle')}
                      <HelpHint title={t('sonde.atmo.windHelpTitle')}>{t('sonde.atmo.windHelpText')}</HelpHint>
                    </>
                  }
                  className="border-t pt-6"
                >
                  <Suspense fallback={<div className="h-[360px]" />}>
                    <WindProfile winds={profile.winds} units={units} syncKey={`vent-${sonde.serial}`} />
                  </Suspense>
                </Section>
              )}

              <p className="border-t pt-6 text-[12.5px] leading-relaxed">
                <Trans k="sonde.atmo.purpose" tags={{ b: (c) => <span className="text-foreground font-semibold">{c}</span> }} />
              </p>
            </>
          )}

          {tab === 'technical' && (
            <>
              <Section title={t('sonde.receivers.title')} right={<HelpHint title={HELP.receivers.title} align="end">{HELP.receivers.text}</HelpHint>}>
                {receivers.length === 0 ? (
                  <p className="text-[13px]">{t('sonde.receivers.none')}</p>
                ) : (
                  <>
                    <p className="text-[13px] leading-relaxed">
                      {t('sonde.receivers.summary', { count: receivers.length, ago: ago(receivers[0].lastHeard, now) })}
                      <HelpHint title={HELP.snr.title}>{HELP.snr.text}</HelpHint>
                    </p>
                    {receiverList(allReceivers ? null : RECEIVERS_PREVIEW)}
                    {receivers.length > RECEIVERS_PREVIEW && (
                      <Button variant="ghost" size="sm" className="-ml-2 text-[13px]" onClick={() => setAllReceivers((v) => !v)}>
                        <ChevronDown className={cx('transition-transform', allReceivers && 'rotate-180')} />
                        {allReceivers ? t('sonde.receivers.collapse') : t('sonde.receivers.showMore', { count: receivers.length - RECEIVERS_PREVIEW })}
                      </Button>
                    )}
                  </>
                )}
              </Section>

              <Section title={t('sonde.tx.title')} className="border-t pt-6">
                <div className="grid grid-cols-3 gap-x-4 gap-y-4">
                  <Stat icon={<Radio />} label={t('sonde.tx.frequency')} value={fmtFreq(f.frequency, false)} sub={f.frequency ? 'MHz' : undefined} />
                  <Stat icon={<Hash />} label={t('sonde.tx.model')} value={sonde.subtype ?? sonde.type ?? '—'} sub={sonde.manufacturer} />
                  <Stat icon={<Timer />} label={t('sonde.tx.frame')} value={f.frame !== undefined ? t('sonde.tx.frameNumber', { frame: f.frame }) : '—'} sub={fmtClock(sonde.lastTime)} />
                  <Stat icon={<BatteryMedium />} label={t('sonde.tx.battery')} value={fmtNum(f.batt, ' V', 2)} />
                  <Stat icon={<Satellite />} label={t('sonde.tx.satellites')} value={fmtNum(f.sats, '', 0)} sub="GPS" />
                  <Stat icon={<Gauge />} label={t('sonde.common.pressure')} value={fmtNum(f.pressure, ' hPa', 1)} />
                  <Stat icon={<Wind />} label={t('sonde.tx.hSpeedShort')} value={fmtHSpeed(f.vel_h, units)} />
                  <Stat icon={<Compass />} label={t('sonde.common.heading')} value={f.heading !== undefined ? `${Math.round(f.heading)}°` : '—'} sub={f.heading !== undefined ? compass(f.heading) : undefined} />
                  <Stat icon={<Ruler />} label={t('sonde.tx.maxAltShort')} value={fmtAlt(sonde.maxAlt, units)} />
                </div>
              </Section>

              {meToSonde && (
                <Section
                  title={
                    <>
                      {t('sonde.pointing.title')}
                      <HelpHint title={HELP.elevation.title}>{HELP.elevation.text}</HelpHint>
                    </>
                  }
                  className="border-t pt-6"
                >
                  <div className="grid grid-cols-3 gap-4">
                    <Stat label={t('sonde.common.distance')} value={fmtDist(meToSonde.d, units)} />
                    <Stat label={t('sonde.pointing.azimuth')} value={`${Math.round(meToSonde.az)}°`} sub={compass(meToSonde.az)} />
                    <Stat label={t('sonde.pointing.elevation')} value={`${meToSonde.el.toFixed(1)}°`} sub={meToSonde.el < 0 ? t('sonde.pointing.belowHorizon') : undefined} />
                  </div>
                </Section>
              )}

              <Section title={t('sonde.data.title')} className="border-t pt-6">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="text-[13px]" onClick={() => downloadKML(sonde, prediction)}>
                    <FileCode2 /> {t('sonde.data.exportKml')}
                  </Button>
                  <Button variant="outline" size="sm" className="text-[13px]" onClick={() => downloadCSV(sonde)}>
                    <FileSpreadsheet /> {t('sonde.data.exportCsv')}
                  </Button>
                </div>
                <Button variant="link" size="xs" asChild className="-ml-2 h-auto text-[13px] font-normal">
                  <a href={`https://sondehub.org/${encodeURIComponent(sonde.serial)}`} target="_blank" rel="noreferrer">
                    <ExternalLink /> {t('sonde.data.viewOnSondeHub')}
                  </a>
                </Button>
                <div className="tabular text-faint text-[12.5px]">
                  {fmtCoord(f.lat, f.lon)} · {fmtClock(sonde.lastTime)}
                </div>
              </Section>
            </>
          )}
        </div>
      </ScrollArea>
      <RecoveryDialog serial={sonde.serial} open={reporting} onOpenChange={setReporting} />
    </div>
  );
}

function pressureSub(hPa: number | undefined): string | undefined {
  if (hPa === undefined || !Number.isFinite(hPa) || hPa <= 0) return undefined;
  const pct = (hPa / 1013.25) * 100;
  return pct >= 95
    ? t('sonde.atmo.pressureGround')
    : t('sonde.atmo.pressurePct', { pct: pct < 10 ? pct.toLocaleString(intlTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(Math.round(pct)) });
}

function sondeLink(serial: string) {
  return `${location.origin}${location.pathname}#s=${encodeURIComponent(serial)}`;
}

async function share(sonde: Sonde, landing: PredictionPoint | null, now: number, units: Units) {
  const url = sondeLink(sonde.serial);
  const flying = sonde.phase === 'ascending' || sonde.phase === 'descending';
  const serial = sonde.serial;
  const alt = fmtAlt(sonde.last.alt, units);
  const text = flying
    ? landing
      ? t('sonde.share.flyingLanding', { serial, alt, when: relative(landing.time * 1000, now) })
      : sonde.phase === 'ascending'
        ? t('sonde.share.ascending', { serial, alt })
        : t('sonde.share.descending', { serial, alt })
    : sonde.phase === 'landed'
      ? t('sonde.share.landed', { serial, ago: ago(sonde.lastTime, now) })
      : t('sonde.share.lost', { serial, ago: ago(sonde.lastTime, now) });
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `${sonde.serial} · SondeHub V2`, text, url });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  await copyText(url, t('sonde.share.linkCopied'));
}

function summarise(
  sonde: Sonde,
  launch: Launch | null,
  landing: PredictionPoint | null,
  prediction: Prediction | undefined,
  now: number,
  units: Units,
): string {
  const f = sonde.last;
  const alt = fmtAltShort(f.alt, units);
  const launched = (g: 'balloon' | 'sonde') => {
    const k =
      g === 'balloon'
        ? ({
            probablyWhere: 'sonde.summary.balloon.probablyWhere',
            probably: 'sonde.summary.balloon.probably',
            whereWhen: 'sonde.summary.balloon.whereWhen',
            where: 'sonde.summary.balloon.where',
            when: 'sonde.summary.balloon.when',
          } as const)
        : ({
            probablyWhere: 'sonde.summary.sonde.probablyWhere',
            probably: 'sonde.summary.sonde.probably',
            whereWhen: 'sonde.summary.sonde.whereWhen',
            where: 'sonde.summary.sonde.where',
            when: 'sonde.summary.sonde.when',
          } as const);
    if (launch?.estimated) {
      const where = launch.site
        ? t('sonde.summary.fromSite', { site: siteLabel(launch.site) })
        : launch.near
          ? t('sonde.summary.nearSite', { distance: fmtDist(launch.near.d, units), direction: cardinal(launch.near.bearing), site: siteLabel(launch.near.site) })
          : '';
      return where ? t(k.probablyWhere, { where, ago: ago(launch.t, now) }) : t(k.probably, { ago: ago(launch.t, now) });
    }
    const where = launch?.site ? t('sonde.summary.fromSite', { site: siteLabel(launch.site) }) : '';
    const when = launch?.fromGround ? ago(launch.t, now) : '';
    if (where && when) return t(k.whereWhen, { where, ago: when });
    if (where) return t(k.where, { where });
    if (when) return t(k.when, { ago: when });
    return '';
  };
  switch (sonde.phase) {
    case 'ascending': {
      const l = launched('balloon');
      const burst = prediction?.burstAltitude && prediction.burstAltitude > f.alt ? fmtAltShort(prediction.burstAltitude, units) : '';
      if (l) return burst ? t('sonde.summary.ascendingLaunchedBurst', { launched: l, alt, burst }) : t('sonde.summary.ascendingLaunched', { launched: l, alt });
      return burst ? t('sonde.summary.ascendingBurst', { alt, burst }) : t('sonde.summary.ascending', { alt });
    }
    case 'descending': {
      const l = launched('balloon');
      const burst = sonde.maxAlt - f.alt > 500 ? fmtAltShort(sonde.maxAlt, units) : '';
      const when = landing ? relative(landing.time * 1000, now) : '';
      if (l && burst)
        return when
          ? t('sonde.summary.descendingLaunchedBurstEta', { launched: l, burst, alt, when })
          : t('sonde.summary.descendingLaunchedBurst', { launched: l, burst, alt });
      if (l) return when ? t('sonde.summary.descendingLaunchedEta', { launched: l, alt, when }) : t('sonde.summary.descendingLaunched', { launched: l, alt });
      if (burst) return when ? t('sonde.summary.descendingBurstEta', { burst, alt, when }) : t('sonde.summary.descendingBurst', { burst, alt });
      return when ? t('sonde.summary.descendingEta', { alt, when }) : t('sonde.summary.descending', { alt });
    }
    case 'landed': {
      if (landing) return t('sonde.summary.landedNearLanding', { ago: ago(sonde.lastTime, now), alt });
      const l = launched('sonde');
      return l ? t('sonde.summary.landedLaunched', { launched: l, ago: ago(sonde.lastTime, now) }) : t('sonde.summary.landed', { ago: ago(sonde.lastTime, now) });
    }
    case 'lost':
      return t('sonde.summary.lost', { ago: ago(sonde.lastTime, now), alt });
  }
}

const snrFmts = new Map<string, Intl.NumberFormat>();

function snrFmt(): Intl.NumberFormat {
  const tag = intlTag();
  let fmt = snrFmts.get(tag);
  if (!fmt) {
    fmt = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    snrFmts.set(tag, fmt);
  }
  return fmt;
}

function SnrBar({ snr }: { snr: number }) {
  const t = useT();
  const level = snr >= 20 ? 4 : snr >= 12 ? 3 : snr >= 6 ? 2 : 1;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex shrink-0 cursor-default items-center gap-1.5">
          <span className="tabular text-[12px]">{snr.toFixed(0)} dB</span>
          <div className="flex h-3 items-end gap-[2px]">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cx('w-[3px] rounded-[1px]', i <= level ? 'bg-foreground' : 'bg-border')} style={{ height: `${i * 25}%` }} />
            ))}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">{t('sonde.receivers.snr', { value: snrFmt().format(snr) })}</TooltipContent>
    </Tooltip>
  );
}

