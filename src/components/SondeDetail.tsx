import { lazy, Suspense, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BatteryMedium,
  ChevronDown,
  Compass,
  Copy,
  Crosshair,
  Download,
  Droplets,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  Gauge,
  Hash,
  LocateFixed,
  PackageCheck,
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
import { ago, fmtAlt, fmtAltShort, fmtClock, fmtCoord, fmtDist, fmtFreq, fmtHSpeed, fmtNum, fmtTemp, fmtVSpeed, relative, type Units } from '@/lib/format';
import type { Prediction, PredictionPoint, Sonde } from '@/lib/types';
import { bearing, compass, distance, elevation, towards } from '@/lib/geo';
import { buildFlight, buildSounding } from '@/lib/flight';
import { downloadCSV, downloadKML } from '@/lib/export';
import { usefulPrediction } from '@/lib/filter';
import { ALT_RAMP } from './MapView';
import { GroundTrack } from './GroundTrack';
import { FlightTimeline } from './FlightTimeline';
import { IconButton, MapIcon, PhaseBadge, Section, Segmented, Stat, cx } from './ui';
import { HELP, HelpHint } from './HelpHint';
import { RecoveryDialog } from './RecoveryDialog';
import { NavMenu } from './NavMenu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const charts = () => import('./FlightCharts');
const AltitudeChart = lazy(() => charts().then((m) => ({ default: m.AltitudeChart })));
const SpeedChart = lazy(() => charts().then((m) => ({ default: m.SpeedChart })));
const ProfileChart = lazy(() => charts().then((m) => ({ default: m.ProfileChart })));
const SoundingCharts = lazy(() => charts().then((m) => ({ default: m.SoundingCharts })));
const FlightTable = lazy(() => charts().then((m) => ({ default: m.FlightTable })));

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

const RECEIVERS_PREVIEW = 8;

type TrackView = 'plan' | 'profile';

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error('Impossible de copier dans le presse-papiers');
  }
}

export function SondeDetail({ serial }: { serial: string }) {
  const sonde = useStore((s) => s.sondes[serial]);
  const prediction = useStore((s) => s.predictions[serial]);
  const units = useStore((s) => s.settings.units);
  const follow = useStore((s) => s.follow);
  const me = useStore((s) => s.userLocation);
  const listeners = useStore((s) => s.listeners);
  const now = useStore((s) => s.now);
  const sites = useStore((s) => s.sites);
  const favourite = useStore((s) => s.settings.favourites.includes(serial));
  const recovery = useStore((s) => s.recoveries[serial]);
  const techOpen = useStore((s) => s.settings.techOpen);
  const { select, setFollow, requestFly, toggleFavourite, setSettings } = useStore.getState();
  const [showReceivers, setShowReceivers] = useState(false);
  const [allReceivers, setAllReceivers] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [trackView, setTrackView] = useState<TrackView>('plan');

  const launch = useMemo(() => {
    if (!sonde?.track.length) return null;
    const [lon, lat, , t] = sonde.track[0];
    let best: { name: string; d: number } | null = null;
    for (const s of sites) {
      const d = distance(lat, lon, s.lat, s.lon);
      if (!best || d < best.d) best = { name: s.name, d };
    }
    return { t, site: best && best.d < 30_000 ? best.name : null, fromGround: sonde.track[0][2] < 3000 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonde?.track[0], sites]);

  const flight = useMemo(
    () => (sonde ? buildFlight(sonde, usefulPrediction(sonde, prediction) ? prediction : null) : null),
    [sonde?.track.length, sonde?.lastTime, sonde?.phase, sonde?.maxAltIdx, sonde?.detailed, prediction],
  );
  const sounding = useMemo(
    () => (sonde ? buildSounding(sonde) : { alt: [], temp: [], hum: [] }),
    [sonde?.track.length, sonde?.maxAltIdx, sonde?.detailed],
  );

  if (!sonde || !flight) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <IconButton label="Retour à la liste" side="bottom" onClick={() => select(null)}>
            <ArrowLeft />
          </IconButton>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="tabular truncate text-[16px] font-semibold">{serial}</h2>
            <Skeleton className="bg-surface h-3 w-32" />
          </div>
        </div>
        <div className="space-y-4 px-5 py-5">
          <p className="text-[13px]">Chargement de la sonde…</p>
          <Skeleton className="bg-surface h-10 w-40" />
          <Skeleton className="bg-surface h-28 w-full rounded-lg" />
        </div>
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

  const toggleFav = () => {
    toggleFavourite(sonde.serial);
    toast(favourite ? 'Sonde retirée de Mes suivis' : 'Sonde ajoutée à Mes suivis', { id: 'fav' });
  };

  const receiverList = (withSignal: boolean, limit: number | null) => (
    <ul className="divide-y rounded-md border">
      {(limit === null ? receivers : receivers.slice(0, limit)).map((r) => {
        const pos = r.position ?? (listeners[r.callsign] ? [listeners[r.callsign].lat, listeners[r.callsign].lon] : undefined);
        const d = pos ? distance(pos[0], pos[1], f.lat, f.lon) : undefined;
        const fresh = sonde.lastTime - r.lastHeard < 60_000;
        return (
          <li key={r.callsign} className="flex items-center gap-3 px-3 py-2">
            <MapIcon id={listeners[r.callsign]?.mobile ? 'chase' : 'listener'} size={20} className={fresh ? '' : 'opacity-40 grayscale'} />
            <div className="min-w-0 flex-1">
              <div className="text-foreground truncate text-[13px] font-semibold">{r.callsign}</div>
              <div className="text-faint truncate text-[12px]">
                {ago(r.lastHeard, now)}
                {d !== undefined ? ` · à ${fmtDist(d, units)} de la sonde` : ''}
                {withSignal && r.software ? ` · ${r.software}` : ''}
              </div>
            </div>
            {withSignal && r.snr !== undefined && <SnrBar snr={r.snr} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="animate-in flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
        <IconButton label="Retour à la liste" side="bottom" onClick={() => select(null)}>
          <ArrowLeft />
        </IconButton>
        <MapIcon id={`sonde-${sonde.phase}`} size={26} />
        <div className="ml-0.5 min-w-0 flex-1">
          <h2 className="tabular truncate text-[16px] leading-tight font-semibold">{sonde.serial}</h2>
          <div className="truncate text-[12.5px]">{model || 'Radiosonde météo'}</div>
        </div>
        <IconButton label="Centrer la carte sur la sonde" side="bottom" onClick={() => requestFly(f.lon, f.lat, 11)}>
          <Crosshair className="size-[18px]" />
        </IconButton>
        <IconButton label={follow ? 'Arrêter de suivre sur la carte' : 'Suivre sur la carte en continu (F)'} side="bottom" active={follow} onClick={() => setFollow(!follow)}>
          <LocateFixed className="size-[18px]" />
        </IconButton>
        <IconButton
          label={favourite ? 'Retirer de Mes suivis' : 'Ajouter à Mes suivis'}
          side="bottom"
          className={cx(favourite && 'text-foreground')}
          aria-pressed={favourite}
          onClick={toggleFav}
        >
          <Star className={cx('size-[18px]', favourite && 'fill-current')} />
        </IconButton>
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div className="space-y-8 px-5 pt-5 pb-10">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <PhaseBadge phase={sonde.phase} />
              <span className="flex items-center gap-2 text-[12.5px]">
                <span className={cx('relative size-2 shrink-0 rounded-full', live ? 'live-dot bg-live' : 'bg-faint')} />
                {live ? 'En direct' : 'Dernier signal'} · {ago(sonde.lastTime, now)}
              </span>
            </div>

            <div>
              <div className="text-[12.5px]">Altitude</div>
              <div className="font-heading tabular text-foreground text-[36px] leading-none font-semibold">{fmtAlt(f.alt, units)}</div>
              <div className="mt-1.5 flex items-center gap-1 text-[12.5px]">
                <span className="min-w-0 truncate">
                  {burstAlt
                    ? `Éclatement à ${fmtAltShort(burstAlt, units)}`
                    : sonde.phase === 'ascending' && useful && prediction.burstAltitude > f.alt
                      ? `Éclatement prévu vers ${fmtAltShort(prediction.burstAltitude, units)}`
                      : `Maximum atteint ${fmtAltShort(sonde.maxAlt, units)}`}
                </span>
                <HelpHint title={burstAlt || sonde.phase === 'ascending' ? HELP.burst.title : HELP.maxAlt.title}>
                  {burstAlt || sonde.phase === 'ascending' ? HELP.burst.text : HELP.maxAlt.text}
                </HelpHint>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[12.5px]">
                  <span className="truncate">{flying ? (falling ? 'Vitesse de chute' : 'Vitesse de montée') : 'Vitesse verticale'}</span>
                  <HelpHint title={HELP.vspeed.title}>{HELP.vspeed.text}</HelpHint>
                </div>
                <div className="font-heading tabular text-foreground mt-0.5 flex items-center gap-1 text-[22px] leading-tight font-semibold">
                  {vv !== undefined && (vv >= 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />)}
                  {fmtVSpeed(vv, units)}
                </div>
                <div className="text-faint truncate text-[12px]">{flying ? (falling ? 'sous parachute' : 'portée par le ballon') : 'à la dernière mesure'}</div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[12.5px]">
                  <span className="truncate">Vitesse horizontale</span>
                  <HelpHint title={HELP.hspeed.title} align="end">
                    {HELP.hspeed.text}
                  </HelpHint>
                </div>
                <div className="font-heading tabular text-foreground mt-0.5 text-[22px] leading-tight font-semibold">{fmtHSpeed(f.vel_h, units)}</div>
                <div className="text-faint truncate text-[12px]">{f.heading !== undefined ? `vers le ${towards(f.heading)}` : 'poussée par le vent'}</div>
              </div>
            </div>

            <p className="text-[13.5px] leading-relaxed">{summarise(sonde, launch, landing, prediction, now, units)}</p>

            {recovery && (
              <div className="flex gap-3 rounded-md border px-3 py-2.5 text-[13px] leading-snug">
                <PackageCheck className="text-foreground mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-foreground font-semibold">
                    {recovery.recovered ? 'Signalée récupérée' : 'Recherche signalée'}
                    {recovery.recoveredBy ? <> par {recovery.recoveredBy}</> : null}
                    <span className="font-normal"> · {ago(recovery.datetime, now)}</span>
                  </div>
                  {recovery.description && <div className="line-clamp-3 break-words">« {recovery.description} »</div>}
                </div>
              </div>
            )}
          </div>

          <Section
            title={
              <>
                Altitude
                <HelpHint title="Lire la courbe">
                  Trait plein : altitude mesurée. Pointillés : suite du vol prévue par le modèle Tawhiri. Survolez ou faites glisser le doigt sur la courbe pour lire
                  les valeurs à chaque instant.
                </HelpHint>
              </>
            }
            className="border-t pt-6"
          >
            <Suspense fallback={<div className="h-[318px]" />}>
              <AltitudeChart d={flight} units={units} now={now} live={live} syncKey={syncKey} />
            </Suspense>
          </Section>

          <Section
            title={
              <>
                Vitesse
                <HelpHint title={HELP.vspeed.title}>{HELP.vspeed.text}</HelpHint>
              </>
            }
            className="border-t pt-6"
          >
            <Suspense fallback={<div className="h-[360px]" />}>
              <SpeedChart d={flight} units={units} now={now} live={live} syncKey={syncKey} />
              <FlightTable d={flight} units={units} />
            </Suspense>
          </Section>

          <Section
            title={
              <>
                Trajectoire
                <HelpHint title={HELP.trajectory.title}>{HELP.trajectory.text}</HelpHint>
              </>
            }
            className="border-t pt-6"
          >
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Parcourue" value={fmtDist(flight.path[flight.last] ?? 0, units)} sub="depuis le lâcher" />
              {toLanding !== null && flying ? (
                <Stat label="Reste" value={fmtDist(toLanding, units)} sub="avant d’atterrir" />
              ) : (
                <Stat label="Du lâcher" value={fmtDist(drift, units)} sub="à vol d’oiseau" />
              )}
              <Stat label="Cap" value={f.heading !== undefined ? `${Math.round(f.heading)}°` : '—'} sub={f.heading !== undefined ? `vers le ${compass(f.heading)}` : undefined} />
            </div>
            <Segmented<TrackView>
              size="sm"
              value={trackView}
              onChange={setTrackView}
              className="w-full [&>*]:flex-1"
              options={[
                { value: 'plan', label: 'Vue de dessus', title: 'Le trajet au sol, nord en haut' },
                { value: 'profile', label: 'Profil', title: 'L’altitude selon la distance parcourue' },
              ]}
            />
            {trackView === 'plan' ? (
              <GroundTrack d={flight} units={units} now={now} live={live} />
            ) : (
              <Suspense fallback={<div className="h-[290px]" />}>
                <ProfileChart d={flight} units={units} now={now} live={live} />
              </Suspense>
            )}
            <AltitudeLegend units={units} />
          </Section>

          <Section
            title={
              <>
                {useful && flying ? 'Prévision du vol' : 'Déroulé du vol'}
                <HelpHint title={HELP.prediction.title}>{HELP.prediction.text}</HelpHint>
              </>
            }
            className="border-t pt-6"
          >
            <FlightTimeline d={flight} phase={sonde.phase} prediction={useful ? prediction : null} units={units} now={now} launch={launch} />
          </Section>

          <Section title="Ce que mesure la sonde" right={<HelpHint title={HELP.sensors.title} align="end">{HELP.sensors.text}</HelpHint>} className="border-t pt-6">
            <div className="grid grid-cols-3 gap-4">
              <Stat icon={<Thermometer />} label="Température" value={fmtTemp(f.temp, units)} sub="de l’air" />
              <Stat icon={<Droplets />} label="Humidité" value={fmtNum(f.humidity, ' %', 0)} sub="de l’air" />
              <Stat icon={<Gauge />} label="Pression" value={fmtNum(f.pressure, ' hPa', 0)} sub={pressureSub(f.pressure)} />
            </div>
            {hasSounding && (
              <Suspense fallback={<div className="h-[340px]" />}>
                <SoundingCharts s={sounding} units={units} syncKey={`sondage-${sonde.serial}`} />
              </Suspense>
            )}
          </Section>

          {showLanding && (
            <Section title={flying ? 'Où va-t-elle tomber ?' : 'Où se trouve-t-elle ?'} className="border-t pt-6">
              <div className="flex items-start gap-3">
                <MapIcon id="landing" size={22} className="mt-0.5" />
                <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                  <div className="text-foreground flex items-center gap-1.5 font-semibold">
                    <span className="truncate">
                      {landing ? (flying ? 'Atterrissage prévu' : 'Atterrissage estimé') : sonde.phase === 'landed' ? 'Position au sol' : 'Dernière position connue'}
                      {landing && flying ? ` ${relative(landing.time * 1000, now)}` : ''}
                    </span>
                    {landing ? (
                      <HelpHint title={HELP.landing.title}>{HELP.landing.text}</HelpHint>
                    ) : sonde.phase === 'lost' ? (
                      <HelpHint title={HELP.lost.title}>{HELP.lost.text}</HelpHint>
                    ) : null}
                  </div>
                  <div>
                    {landing && flying && <>vers {fmtClock(landing.time * 1000).slice(0, 5)}</>}
                    {landing && !flying && (
                      <>
                        Signal perdu à {fmtAltShort(f.alt, units)} · {ago(sonde.lastTime, now)}
                      </>
                    )}
                    {!landing && ago(sonde.lastTime, now)}
                    {fromMe && <> · à {fmtDist(fromMe.d, units)} de vous, vers le {towards(fromMe.b)}</>}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="tabular text-muted-foreground hover:text-foreground -ml-2 text-[12.5px] font-normal"
                        onClick={() => copyText(`${target.lat.toFixed(5)}, ${target.lon.toFixed(5)}`, 'Coordonnées copiées')}
                      >
                        {fmtCoord(target.lat, target.lon)}
                        <Copy />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Copier les coordonnées</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="text-[13px]" onClick={() => requestFly(target.lon, target.lat, 12)}>
                  <Crosshair /> Voir sur la carte
                </Button>
                <NavMenu target={target} heading={landing ? 'Itinéraire vers l’atterrissage' : 'Itinéraire vers la sonde'} className="text-[13px]" />
                {recoverable && (
                  <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => setReporting(true)}>
                    <PackageCheck /> Je l’ai trouvée
                  </Button>
                )}
              </div>
            </Section>
          )}

          <Section title="Qui reçoit son signal ?" right={<HelpHint title={HELP.receivers.title} align="end">{HELP.receivers.text}</HelpHint>} className="border-t pt-6">
            {receivers.length === 0 ? (
              <p className="text-[13px]">Aucune station ne l’a encore captée sur la période affichée.</p>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed">
                  {receivers.length === 1 ? 'Une station' : `${receivers.length} stations`} de passionnés {receivers.length === 1 ? 'a capté' : 'ont capté'} cette
                  sonde par radio et {receivers.length === 1 ? 'partage' : 'partagent'} sa position. Dernière réception {ago(receivers[0].lastHeard, now)}.
                </p>
                {showReceivers && receiverList(false, null)}
                <Button variant="ghost" size="sm" className="-ml-2 text-[13px]" onClick={() => setShowReceivers((v) => !v)} aria-expanded={showReceivers}>
                  <ChevronDown className={cx('transition-transform', showReceivers && 'rotate-180')} />
                  {showReceivers ? 'Masquer les stations' : 'Voir les stations'}
                </Button>
              </>
            )}
          </Section>

          <div className="space-y-2 border-t pt-6">
            <Button variant="outline" className="h-9 w-full text-[13.5px]" onClick={() => share(sonde, landing, now, units)}>
              <Share2 /> Partager cette sonde
            </Button>
            {!showLanding && (
              <Button variant="link" size="xs" className="-ml-2 h-auto text-[13px] font-normal" onClick={() => setReporting(true)}>
                Vous avez trouvé cette sonde ? Signalez-le
              </Button>
            )}
          </div>

          <div className="border-t">
            <button
              type="button"
              aria-expanded={techOpen}
              aria-controls="tech-details"
              onClick={() => setSettings({ techOpen: !techOpen })}
              className="focus-visible:ring-ring/50 flex w-full items-center gap-3 py-4 text-left outline-none focus-visible:ring-2"
            >
              <span className="min-w-0 flex-1">
                <span className="font-heading text-foreground block text-[15px] font-semibold">Détails techniques</span>
                <span className="block text-[12.5px]">Fréquence, batterie, GPS, pointage d’antenne, réception, export</span>
              </span>
              <ChevronDown className={cx('text-muted-foreground size-5 transition-transform', techOpen && 'rotate-180')} />
            </button>

            {techOpen && (
              <div id="tech-details" className="space-y-6 pb-2">
                <div className="grid grid-cols-3 gap-x-4 gap-y-4">
                  <Stat icon={<Radio />} label="Fréquence" value={fmtFreq(f.frequency, false)} sub={f.frequency ? 'MHz' : undefined} />
                  <Stat icon={<Hash />} label="Modèle" value={sonde.subtype ?? sonde.type ?? '—'} sub={sonde.manufacturer} />
                  <Stat icon={<Timer />} label="Trame" value={f.frame !== undefined ? `n° ${f.frame}` : '—'} sub={fmtClock(sonde.lastTime)} />
                  <Stat icon={<BatteryMedium />} label="Batterie" value={fmtNum(f.batt, ' V', 2)} />
                  <Stat icon={<Satellite />} label="Satellites" value={fmtNum(f.sats, '', 0)} sub="GPS" />
                  <Stat icon={<Gauge />} label="Pression" value={fmtNum(f.pressure, ' hPa', 1)} />
                  <Stat icon={<Wind />} label="Vit. horiz." value={fmtHSpeed(f.vel_h, units)} />
                  <Stat icon={<Compass />} label="Cap" value={f.heading !== undefined ? `${Math.round(f.heading)}°` : '—'} sub={f.heading !== undefined ? compass(f.heading) : undefined} />
                  <Stat icon={<Ruler />} label="Alt. max" value={fmtAlt(sonde.maxAlt, units)} />
                </div>

                {meToSonde && (
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-1.5 text-[14px] font-semibold">
                      Pointage depuis votre position
                      <HelpHint title={HELP.elevation.title}>{HELP.elevation.text}</HelpHint>
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <Stat label="Distance" value={fmtDist(meToSonde.d, units)} />
                      <Stat label="Azimut" value={`${Math.round(meToSonde.az)}°`} sub={compass(meToSonde.az)} />
                      <Stat label="Élévation" value={`${meToSonde.el.toFixed(1)}°`} sub={meToSonde.el < 0 ? 'sous l’horizon' : undefined} />
                    </div>
                  </div>
                )}

                {receivers.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-1.5 text-[14px] font-semibold">
                      Réception ({receivers.length})
                      <HelpHint title={HELP.snr.title}>{HELP.snr.text}</HelpHint>
                    </h4>
                    {receiverList(true, allReceivers ? null : RECEIVERS_PREVIEW)}
                    {receivers.length > RECEIVERS_PREVIEW && (
                      <Button variant="ghost" size="sm" className="-ml-2 text-[13px]" onClick={() => setAllReceivers((v) => !v)}>
                        <ChevronDown className={cx('transition-transform', allReceivers && 'rotate-180')} />
                        {allReceivers ? 'Réduire' : `Voir les ${receivers.length - RECEIVERS_PREVIEW} autres`}
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="tabular text-faint text-[12.5px]">
                    {fmtCoord(f.lat, f.lon)} · {fmtClock(sonde.lastTime)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="text-[13px]">
                        <Download /> Exporter <ChevronDown className="opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56" onEscapeKeyDown={keepSelection}>
                      <DropdownMenuItem className="text-[13.5px]" onSelect={() => downloadKML(sonde, prediction)}>
                        <FileCode2 /> Fichier KML
                        <span className="text-muted-foreground ml-auto text-[12px]">Google Earth</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-[13.5px]" onSelect={() => downloadCSV(sonde)}>
                        <FileSpreadsheet /> Fichier CSV
                        <span className="text-muted-foreground ml-auto text-[12px]">Tableur</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild className="text-[13.5px]">
                        <a href={`https://sondehub.org/${encodeURIComponent(sonde.serial)}`} target="_blank" rel="noreferrer">
                          <ExternalLink /> Voir sur SondeHub
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      <RecoveryDialog serial={sonde.serial} open={reporting} onOpenChange={setReporting} />
    </div>
  );
}

function AltitudeLegend({ units }: { units: Units }) {
  const label = (m: number) => (units === 'metric' ? `${Math.round(m / 1000)} km` : `${Math.round((m * 3.28084) / 1000)} kft`);
  return (
    <div>
      <div className="mb-1.5 text-[12.5px]">Couleur du tracé sur la carte</div>
      <div className="flex gap-0.5">
        {ALT_RAMP.slice(0, -1).map(([a, c]) => (
          <div key={a} className="min-w-0 flex-1">
            <div className="h-1.5 rounded-xs" style={{ background: c }} />
            <div className="tabular text-faint mt-1 text-[11px]">{label(a)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pressureSub(hPa: number | undefined): string | undefined {
  if (hPa === undefined || !Number.isFinite(hPa) || hPa <= 0) return undefined;
  const pct = (hPa / 1013.25) * 100;
  return pct >= 95 ? 'comme au sol' : `${pct < 10 ? pct.toFixed(1).replace('.', ',') : Math.round(pct)} % du sol`;
}

function sondeLink(serial: string) {
  return `${location.origin}${location.pathname}#s=${encodeURIComponent(serial)}`;
}

async function share(sonde: Sonde, landing: PredictionPoint | null, now: number, units: Units) {
  const url = sondeLink(sonde.serial);
  const flying = sonde.phase === 'ascending' || sonde.phase === 'descending';
  const text = flying
    ? `Radiosonde ${sonde.serial} à ${fmtAlt(sonde.last.alt, units)}${landing ? ` — atterrissage prévu ${relative(landing.time * 1000, now)}` : sonde.phase === 'ascending' ? ', en montée' : ', en descente'}`
    : sonde.phase === 'landed'
      ? `Radiosonde ${sonde.serial} au sol — dernière position ${ago(sonde.lastTime, now)}`
      : `Radiosonde ${sonde.serial} — signal perdu ${ago(sonde.lastTime, now)}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `${sonde.serial} · SondeHub V2`, text, url });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  await copyText(url, 'Lien copié dans le presse-papiers');
}

function summarise(
  sonde: Sonde,
  launch: { t: number; site: string | null; fromGround: boolean } | null,
  landing: PredictionPoint | null,
  prediction: Prediction | undefined,
  now: number,
  units: Units,
): string {
  const f = sonde.last;
  const alt = fmtAltShort(f.alt, units);
  const launched = (e: '' | 'e') => {
    const where = launch?.site ? ` depuis ${launch.site}` : '';
    const when = launch?.fromGround ? ` ${ago(launch.t, now)}` : '';
    return where || when ? `lâché${e}${where}${when}` : '';
  };
  switch (sonde.phase) {
    case 'ascending': {
      const l = launched('');
      const burst = prediction?.burstAltitude && prediction.burstAltitude > f.alt ? ` ; il devrait éclater vers ${fmtAltShort(prediction.burstAltitude, units)}` : '';
      return `Ballon météo ${l ? `${l}, ` : ''}actuellement à ${alt} d’altitude et en montée${burst}.`;
    }
    case 'descending': {
      const l = launched('');
      const burst = sonde.maxAlt - f.alt > 500 ? `éclaté à ${fmtAltShort(sonde.maxAlt, units)}` : '';
      const intro = l || burst ? `Ballon météo ${[l, burst].filter(Boolean).join(', ')} : la sonde` : 'La sonde';
      const eta = landing ? `, atterrissage prévu ${relative(landing.time * 1000, now)}` : '';
      return `${intro} redescend sous parachute, actuellement à ${alt}${eta}.`;
    }
    case 'landed': {
      if (landing) return `Signal perdu ${ago(sonde.lastTime, now)} à ${alt} pendant la descente : la sonde est probablement au sol près de l’atterrissage estimé.`;
      const l = launched('e');
      return `${l ? `Sonde ${l}, désormais au sol` : 'Sonde au sol'} ; dernier signal reçu ${ago(sonde.lastTime, now)}.`;
    }
    case 'lost':
      return `Signal perdu ${ago(sonde.lastTime, now)} à ${alt} d’altitude : la sonde n’est plus captée par les stations.`;
  }
}

const snrFmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function SnrBar({ snr }: { snr: number }) {
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
      <TooltipContent side="left">SNR {snrFmt.format(snr)} dB</TooltipContent>
    </Tooltip>
  );
}

