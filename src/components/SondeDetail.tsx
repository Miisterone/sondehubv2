import { useMemo, useState, type ComponentProps } from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  MapPinned,
  PackageCheck,
  Share2,
  Star,
  Navigation,
  Target,
  LocateFixed,
  Copy,
  Thermometer,
  Droplets,
  Gauge,
  BatteryMedium,
  Satellite,
  Hash,
  Timer,
  Ruler,
  Compass,
  Radio,
  SlidersHorizontal,
  Wind,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { ago, fmtAlt, fmtAltShort, fmtClock, fmtCoord, fmtDist, fmtDuration, fmtHSpeed, fmtNum, fmtTemp, fmtVSpeed, relative, type Units } from '@/lib/format';
import type { Prediction, PredictionPoint, Sonde } from '@/lib/types';
import { bearing, compass, distance, elevation } from '@/lib/geo';
import { COLOURS, PHASE_COLOUR } from '@/lib/icons';
import { downloadCSV, downloadKML } from '@/lib/export';
import { usefulPrediction } from '@/lib/filter';
import { ALT_RAMP } from './MapView';
import { SondeCharts } from './SondeCharts';
import { IconButton, MapIcon, PhaseBadge, Section, Stat, cx } from './ui';
import { HELP, HelpHint } from './HelpHint';
import { RecoveryDialog } from './RecoveryDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Escape closes the menu only: stop it reaching App's global "Escape = deselect" shortcut. */
const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

/** Receivers shown before the "Voir les N autres" expander. */
const RECEIVERS_PREVIEW = 8;

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
  const expert = useStore((s) => s.settings.expert);
  const { select, setFollow, requestFly, toggleFavourite, setExpert } = useStore.getState();
  const [allReceivers, setAllReceivers] = useState(false);
  const [reporting, setReporting] = useState(false);

  const launch = useMemo(() => {
    if (!sonde?.track.length) return null;
    const [lon, lat, , t] = sonde.track[0];
    let best: { name: string; d: number } | null = null;
    for (const s of sites) {
      const d = distance(lat, lon, s.lat, s.lon);
      if (!best || d < best.d) best = { name: s.name, d };
    }
    // The track only covers the selected time window: its first point is the launch only if it is near the ground.
    return { t, site: best && best.d < 30_000 ? best.name : null, fromGround: sonde.track[0][2] < 3000 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonde?.track[0], sites]);

  if (!sonde) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-2.5 py-2.5">
          <IconButton label="Retour à la liste" side="bottom" className="size-8" onClick={() => select(null)}>
            <ArrowLeft />
          </IconButton>
          <Skeleton className="size-9 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="truncate font-mono text-[15px] font-bold">{serial}</div>
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="text-muted-foreground text-xs">Chargement de la sonde…</div>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const f = sonde.last;
  const vv = f.vel_v;
  const landing = usefulPrediction(sonde, prediction) ? prediction.landing : null;
  const flying = sonde.phase === 'ascending' || sonde.phase === 'descending';
  const target = landing ? { lat: landing.lat, lon: landing.lon } : { lat: f.lat, lon: f.lon };
  const fromMe = me ? { d: distance(me.lat, me.lon, target.lat, target.lon), b: bearing(me.lat, me.lon, target.lat, target.lon) } : null;
  const meToSonde = me
    ? { d: distance(me.lat, me.lon, f.lat, f.lon), az: bearing(me.lat, me.lon, f.lat, f.lon), el: elevation(me.lat, me.lon, me.alt ?? 0, f.lat, f.lon, f.alt) }
    : null;
  const model = [sonde.manufacturer, sonde.type].filter((v, i, a) => v && a.indexOf(v) === i).join(' ');
  const burstAlt = sonde.phase !== 'ascending' && sonde.maxAlt - f.alt > 500 ? sonde.maxAlt : null;

  const receivers = Object.values(sonde.receivers).sort((a, b) => b.lastHeard - a.lastHeard);
  const shownReceivers = allReceivers ? receivers : receivers.slice(0, RECEIVERS_PREVIEW);
  const hiddenReceivers = receivers.length - RECEIVERS_PREVIEW;
  const live = now - sonde.lastTime < 60_000;
  const descending = vv !== undefined && vv < -0.5;
  // Recovery reports matter once the sonde is on (or close to) the ground.
  const recoverable = sonde.phase === 'landed' || sonde.phase === 'lost' || (sonde.phase === 'descending' && f.alt < 3000);

  const toggleFav = () => {
    toggleFavourite(sonde.serial);
    if (favourite) toast('Sonde retirée de vos suivis', { id: 'fav' });
    else toast.success('Sonde suivie — elle restera en haut de la liste', { id: 'fav' });
  };

  const shareBlock = (
    <>
      <div className="flex gap-2">
        <Button size="sm" className="h-8 flex-1 text-xs" onClick={() => share(sonde, landing, now, units)}>
          <Share2 /> Partager
        </Button>
        {expert && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 flex-1 text-xs">
                <Download /> Exporter <ChevronDown className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" onEscapeKeyDown={keepSelection}>
              <DropdownMenuItem className="text-[13px]" onSelect={() => downloadKML(sonde, prediction)}>
                <FileCode2 /> Fichier KML
                <span className="text-muted-foreground ml-auto text-[11px]">Google Earth</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-[13px]" onSelect={() => downloadCSV(sonde)}>
                <FileSpreadsheet /> Fichier CSV
                <span className="text-muted-foreground ml-auto text-[11px]">Tableur</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="text-[13px]">
                <a href={`https://sondehub.org/${encodeURIComponent(sonde.serial)}`} target="_blank" rel="noreferrer">
                  <ExternalLink /> Voir sur SondeHub
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {!recoverable && (
        <Button variant="link" size="xs" className="text-muted-foreground hover:text-foreground h-auto px-0 text-[11.5px] font-normal" onClick={() => setReporting(true)}>
          <PackageCheck /> Vous avez trouvé cette sonde ? Signaler une récupération
        </Button>
      )}
    </>
  );

  return (
    <div className="animate-in flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-2.5">
        <IconButton label="Retour à la liste" side="bottom" className="size-8" onClick={() => select(null)}>
          <ArrowLeft />
        </IconButton>
        <span className="ml-0.5 grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `${PHASE_COLOUR[sonde.phase]}1f` }}>
          <MapIcon id={`sonde-${sonde.phase}`} size={24} />
        </span>
        <div className="ml-0.5 min-w-0 flex-1">
          <h2 className="truncate font-mono text-[15px] font-bold tracking-tight">{sonde.serial}</h2>
          {expert ? (
            <div className="text-muted-foreground flex min-w-0 text-[11.5px]" title={[sonde.manufacturer, sonde.subtype ?? sonde.type].filter(Boolean).join(' · ')}>
              <span className="truncate">{sonde.subtype ?? sonde.type ?? sonde.manufacturer}</span>
              {f.frequency ? <span className="tabular shrink-0 whitespace-pre"> · {f.frequency.toFixed(3)} MHz</span> : null}
            </div>
          ) : (
            <div className="text-muted-foreground truncate text-[11.5px]">{model ? `Radiosonde ${model}` : 'Radiosonde météo'}</div>
          )}
        </div>
        <IconButton label="Centrer sur la sonde" side="bottom" className="size-8" onClick={() => requestFly(f.lon, f.lat, 11)}>
          <Crosshair />
        </IconButton>
        <IconButton
          label={follow ? 'Arrêter de centrer la carte' : 'Centrer la carte en continu (F)'}
          side="bottom"
          className="size-8"
          active={follow}
          onClick={() => setFollow(!follow)}
        >
          <LocateFixed />
        </IconButton>
        <IconButton
          label={favourite ? 'Ne plus suivre cette sonde' : 'Suivre cette sonde (épinglée en haut de la liste)'}
          side="bottom"
          className={cx('size-8', favourite && 'text-amber-500 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-400')}
          aria-pressed={favourite}
          onClick={toggleFav}
        >
          <Star className={cx(favourite && 'fill-current')} />
        </IconButton>
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div className="space-y-4 px-4 pt-4 pb-6">
          {/* Plain-language summary for newcomers. */}
          <p className="text-muted-foreground text-[12.5px] leading-relaxed">
            <PhaseBadge phase={sonde.phase} className="mr-1.5 align-[1px]" />
            {summarise(sonde, launch, landing, prediction, now, units)}
          </p>

          {recovery && (
            <div className="flex gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[12px] leading-snug">
              <PackageCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <div className="font-semibold">
                  {recovery.recovered ? 'Signalée récupérée' : 'Recherche signalée'}
                  {recovery.recoveredBy ? <> par {recovery.recoveredBy}</> : null}
                  <span className="text-muted-foreground font-normal"> · {ago(recovery.datetime, now)}</span>
                </div>
                {recovery.description && <div className="text-muted-foreground line-clamp-3 break-words">« {recovery.description} »</div>}
              </div>
            </div>
          )}

          {/* Hero */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-faint text-[11px] font-semibold tracking-wider uppercase">Altitude</div>
              <div className="tabular font-mono text-[32px] leading-none font-bold tracking-tight">{fmtAlt(f.alt, units)}</div>
              <div className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-[11.5px]">
                <span className={cx('size-2 shrink-0 rounded-full', live ? 'live-dot bg-emerald-500' : 'bg-muted-foreground/50')} />
                <span className="truncate">
                  {live ? 'En direct' : 'Dernière trame'} · {ago(sonde.lastTime, now)}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="tabular inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[15px] font-semibold"
                style={{
                  color: descending ? PHASE_COLOUR.descending : PHASE_COLOUR.ascending,
                  background: `${descending ? PHASE_COLOUR.descending : PHASE_COLOUR.ascending}1a`,
                }}
              >
                {vv !== undefined && (vv >= 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />)}
                {fmtVSpeed(vv, units)}
              </div>
              {expert ? (
                <div className="text-muted-foreground tabular mt-1 font-mono text-[11.5px]">
                  {fmtHSpeed(f.vel_h, units)}
                  {f.heading !== undefined ? ` · ${compass(f.heading)} ${Math.round(f.heading)}°` : ''}
                </div>
              ) : (
                <div className="text-muted-foreground mt-1 flex items-center justify-end gap-1 text-[11.5px]">
                  {flying ? (vv !== undefined && vv < 0 ? 'vitesse de chute' : 'vitesse de montée') : 'vitesse verticale'}
                  <HelpHint title={HELP.vspeed.title} align="end">
                    {HELP.vspeed.text}
                  </HelpHint>
                </div>
              )}
            </div>
          </div>

          {!expert && flying && f.vel_h !== undefined && (
            <p className="text-muted-foreground -mt-2 text-[12px]">
              Poussée par le vent à <span className="text-foreground font-medium">{fmtHSpeed(f.vel_h, units)}</span>
              {f.heading !== undefined ? ` vers le ${COMPASS_WORD[compass(f.heading)] ?? compass(f.heading)}` : ''}.
            </p>
          )}

          {/* Prediction / landing */}
          {(landing || sonde.phase === 'landed' || sonde.phase === 'lost') && (
            <Card className="gap-3 px-3.5 py-3.5 shadow-none" style={{ borderColor: `${COLOURS.landing}4d`, backgroundImage: `linear-gradient(${COLOURS.landing}0d, ${COLOURS.landing}0d)` }}>
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `${COLOURS.landing}22`, color: COLOURS.landing }}>
                  <Target className="size-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                      <span className="truncate">
                        {landing ? (flying ? 'Atterrissage prévu' : 'Atterrissage estimé') : sonde.phase === 'landed' ? 'Position au sol' : 'Dernière position connue'}
                      </span>
                      {landing ? (
                        <HelpHint title={HELP.landing.title}>{HELP.landing.text}</HelpHint>
                      ) : sonde.phase === 'lost' ? (
                        <HelpHint title={HELP.lost.title}>{HELP.lost.text}</HelpHint>
                      ) : null}
                    </div>
                    {landing && flying && (
                      <div className="tabular shrink-0 font-mono text-[13px] font-semibold" style={{ color: COLOURS.landing }}>
                        {relative(landing.time * 1000, now)}
                      </div>
                    )}
                  </div>
                  <div className="text-muted-foreground text-[11.5px]">
                    {landing && flying && <>vers {fmtClock(landing.time * 1000)}</>}
                    {landing && !flying && (
                      <span className="inline-flex items-center gap-1">
                        Signal perdu à {fmtAlt(f.alt, units)} · {ago(sonde.lastTime, now)}
                        <HelpHint title={HELP.lost.title}>{HELP.lost.text}</HelpHint>
                      </span>
                    )}
                    {!landing && ago(sonde.lastTime, now)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground hover:text-foreground -ml-1.5 font-mono text-[11.5px] font-normal"
                      onClick={() => copyText(`${target.lat.toFixed(5)}, ${target.lon.toFixed(5)}`, 'Coordonnées copiées')}
                    >
                      {fmtCoord(target.lat, target.lon)}
                      <Copy />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Copier les coordonnées</TooltipContent>
                </Tooltip>
                {fromMe && (
                  <div className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
                    <Navigation className="text-muted-foreground size-3 shrink-0" style={{ transform: `rotate(${fromMe.b - 45}deg)` }} />
                    <span className="tabular font-mono font-semibold">{fmtDist(fromMe.d, units)}</span>
                    <span className="text-muted-foreground truncate">
                      de vous · {compass(fromMe.b)} {Math.round(fromMe.b)}°
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-8 flex-1 text-xs">
                      <Navigation /> Naviguer <ChevronDown className="opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52" onEscapeKeyDown={keepSelection}>
                    <DropdownMenuLabel className="text-muted-foreground text-[11px] font-medium">Itinéraire vers {landing ? 'l’atterrissage' : 'la sonde'}</DropdownMenuLabel>
                    {navLinks(target, me).map((l) => (
                      <DropdownMenuItem key={l.label} asChild className="text-[13px]">
                        <a href={l.href} target="_blank" rel="noreferrer">
                          <MapPinned /> {l.label}
                          <ExternalLink className="ml-auto size-3!" />
                        </a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" className="h-8 flex-1 text-xs" onClick={() => requestFly(target.lon, target.lat, 12)}>
                  <Crosshair /> Voir sur la carte
                </Button>
              </div>
            </Card>
          )}

          {recoverable && (
            <Button variant="outline" className="h-9 w-full text-[13px]" onClick={() => setReporting(true)}>
              <PackageCheck /> Signaler une récupération
            </Button>
          )}

          {/* Flight summary */}
          <Section title="Vol">
            <div className="grid grid-cols-3 gap-2">
              <HintStat
                label={burstAlt ? 'Éclatement' : 'Alt. max'}
                help={burstAlt || sonde.phase === 'ascending' ? HELP.burst : HELP.maxAlt}
                value={fmtAlt(burstAlt ?? sonde.maxAlt, units)}
                sub={!burstAlt && prediction && sonde.phase === 'ascending' ? `prévu ${fmtAlt(prediction.burstAltitude, units)}` : undefined}
                accent={burstAlt ? COLOURS.burst : undefined}
              />
              <Stat
                icon={<Timer />}
                label="Durée"
                // When reception started high up, the real launch is earlier than the first known point.
                value={launch ? `${launch.fromGround ? '' : '≥ '}${fmtDuration(sonde.lastTime - launch.t)}` : '—'}
                sub={launch ? (launch.fromGround ? `depuis ${fmtClock(launch.t)}` : `reçue dès ${fmtClock(launch.t).slice(0, 5)}`) : undefined}
              />
              <HintStat
                label={sonde.phase === 'ascending' ? 'Montée' : 'Descente'}
                help={HELP.rate}
                value={prediction ? fmtVSpeed(sonde.phase === 'ascending' ? prediction.ascentRate : -prediction.descentRate, units) : '—'}
                sub={prediction ? 'moyenne' : undefined}
              />
            </div>
            {/* Altitude ramp legend for the coloured trajectory. */}
            <div className="pt-0.5">
              <div className="text-muted-foreground mb-1 text-[11px]">Couleur du tracé sur la carte selon l’altitude</div>
              <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${ALT_RAMP.map(([a, c]) => `${c} ${(a / 38000) * 100}%`).join(',')})` }} />
              <div className="text-faint mt-1 flex justify-between font-mono text-[10px]">
                <span>0</span>
                <span>{units === 'metric' ? '10 km' : '33 kft'}</span>
                <span>{units === 'metric' ? '20 km' : '66 kft'}</span>
                <span>{units === 'metric' ? '30 km' : '98 kft'}</span>
                <span>{units === 'metric' ? '38 km' : '125 kft'}</span>
              </div>
            </div>
          </Section>

          <div className="space-y-2">
            <h3 className="text-faint flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
              {expert ? 'Courbes' : 'Altitude au fil du vol'}
              <HelpHint title="Lire les courbes">
                <span className="block">
                  <b className="text-foreground font-medium">Altitude</b> : trait plein = mesurée ; pointillés = prédiction du modèle Tawhiri (vents prévus), recalculée au fil du vol.
                </span>
                {expert && (
                  <span className="mt-1 block">
                    <b className="text-foreground font-medium">Sondage T° / HR</b> : {HELP.profile.text}
                  </span>
                )}
              </HelpHint>
            </h3>
            <SondeCharts sonde={sonde} prediction={prediction} units={units} simple={!expert} />
          </div>

          <Separator />

          {expert ? (
            <Section title="Capteurs & télémesure" right={<HelpHint title={HELP.sensors.title} align="end">{HELP.sensors.text}</HelpHint>}>
              <div className="grid grid-cols-3 gap-2">
                <Stat icon={<Thermometer />} label="Temp." value={fmtTemp(f.temp, units)} />
                <Stat icon={<Droplets />} label="Humidité" value={fmtNum(f.humidity, ' %')} />
                <Stat icon={<Gauge />} label="Pression" value={fmtNum(f.pressure, ' hPa')} />
                <Stat icon={<BatteryMedium />} label="Batterie" value={fmtNum(f.batt, ' V', 2)} />
                <Stat icon={<Satellite />} label="Satellites" value={fmtNum(f.sats, '', 0)} />
                <Stat icon={<Hash />} label="Trame" value={f.frame !== undefined ? `#${f.frame}` : '—'} />
                <Stat icon={<Radio />} label="Fréquence" value={f.frequency ? f.frequency.toFixed(3) : '—'} sub={f.frequency ? 'MHz' : undefined} />
                <Stat icon={<Wind />} label="Vit. horiz." value={fmtHSpeed(f.vel_h, units)} />
                <Stat icon={<Compass />} label="Cap" value={f.heading !== undefined ? `${Math.round(f.heading)}°` : '—'} sub={f.heading !== undefined ? compass(f.heading) : undefined} />
              </div>
              {meToSonde && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-faint flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
                    Pointage depuis votre position
                    <HelpHint title={HELP.elevation.title}>{HELP.elevation.text}</HelpHint>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat icon={<Ruler />} label="Distance" value={fmtDist(meToSonde.d, units)} />
                    <Stat icon={<Compass />} label="Azimut" value={`${Math.round(meToSonde.az)}°`} sub={compass(meToSonde.az)} />
                    <Stat label="Élévation" value={`${meToSonde.el.toFixed(1)}°`} sub={meToSonde.el < 0 ? 'sous l’horizon' : undefined} />
                  </div>
                </div>
              )}
              <div className="text-faint font-mono text-[11px]">
                {fmtCoord(f.lat, f.lon)} · {fmtClock(sonde.lastTime)}
              </div>
            </Section>
          ) : (
            <Section title="Ce que mesure la sonde" right={<HelpHint title={HELP.sensors.title} align="end">{HELP.sensors.text}</HelpHint>}>
              <div className="grid grid-cols-3 gap-2">
                <Stat icon={<Thermometer />} label="Temp." value={fmtTemp(f.temp, units)} sub="de l’air" />
                <Stat icon={<Droplets />} label="Humidité" value={fmtNum(f.humidity, ' %', 0)} sub="de l’air" />
                <Stat icon={<Gauge />} label="Pression" value={fmtNum(f.pressure, ' hPa', 0)} sub={pressureSub(f.pressure)} />
              </div>
              {meToSonde && (
                <p className="text-muted-foreground text-[12px]">
                  Elle se trouve à <span className="text-foreground font-medium">{fmtDist(meToSonde.d, units)}</span> de vous, vers le{' '}
                  {COMPASS_WORD[compass(meToSonde.az)] ?? compass(meToSonde.az)}.
                </p>
              )}
            </Section>
          )}

          <Separator />

          {/* Receivers */}
          <Section
            title={expert ? `Récepteurs (${receivers.length})` : 'Qui reçoit son signal ?'}
            right={
              <span className="text-faint flex items-center gap-2.5 text-[11px] font-semibold tracking-wider uppercase">
                <HelpHint title={HELP.receivers.title} align="end">
                  {HELP.receivers.text}
                </HelpHint>
                {expert && receivers.some((r) => r.snr !== undefined) && (
                  <span className="flex items-center gap-1">
                    SNR
                    <HelpHint title={HELP.snr.title} align="end">
                      {HELP.snr.text}
                    </HelpHint>
                  </span>
                )}
              </span>
            }
          >
            {!expert && receivers.length > 0 && (
              <p className="text-muted-foreground text-[12px] leading-snug">
                {receivers.length === 1 ? 'Une station' : `${receivers.length} stations`} de passionnés{' '}
                {receivers.length === 1 ? 'a capté' : 'ont capté'} cette sonde par radio et partagent sa position. Dernière réception{' '}
                {ago(receivers[0].lastHeard, now)}.
              </p>
            )}
            {receivers.length === 0 ? (
              <div className="text-muted-foreground text-[11.5px]">Aucun récepteur connu.</div>
            ) : !expert && !allReceivers ? null : (
              <ul className="space-y-1">
                {shownReceivers.map((r) => {
                  const pos = r.position ?? (listeners[r.callsign] ? [listeners[r.callsign].lat, listeners[r.callsign].lon] : undefined);
                  const d = pos ? distance(pos[0], pos[1], f.lat, f.lon) : undefined;
                  const fresh = sonde.lastTime - r.lastHeard < 60_000;
                  return (
                    <li key={r.callsign} className="bg-chip flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
                      <MapIcon id={listeners[r.callsign]?.mobile ? 'chase' : 'listener'} size={20} className={fresh ? '' : 'opacity-40 grayscale'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12px] font-medium">{r.callsign}</div>
                        <div className="text-faint truncate text-[11px]">
                          {ago(r.lastHeard, now)}
                          {d !== undefined ? ` · ${fmtDist(d, units)}` : ''}
                          {expert && r.software ? ` · ${r.software}` : ''}
                        </div>
                      </div>
                      {expert && r.snr !== undefined && <SnrBar snr={r.snr} />}
                    </li>
                  );
                })}
              </ul>
            )}
            {!expert && receivers.length > 0 && (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-7 w-full text-xs" onClick={() => setAllReceivers((v) => !v)}>
                {allReceivers ? (
                  <>
                    <ChevronUp /> Masquer les stations
                  </>
                ) : (
                  <>
                    <ChevronDown /> Voir les stations
                  </>
                )}
              </Button>
            )}
            {expert && hiddenReceivers > 0 && (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-7 w-full text-xs" onClick={() => setAllReceivers((v) => !v)}>
                {allReceivers ? (
                  <>
                    <ChevronUp /> Réduire
                  </>
                ) : (
                  <>
                    <ChevronDown /> Voir les {hiddenReceivers} autres
                  </>
                )}
              </Button>
            )}
          </Section>

          <Separator />

          {/* Actions */}
          {expert ? <Section title="Partager & exporter">{shareBlock}</Section> : <div className="space-y-2">{shareBlock}</div>}

          {expert ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 w-full text-xs" onClick={() => setExpert(false)}>
              <SlidersHorizontal /> Revenir à la vue simple
            </Button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[12px] leading-snug">
                <span className="font-medium">Données techniques</span>
                <span className="text-muted-foreground block text-[11.5px]">Fréquence radio, batterie, GPS, qualité de réception, pointage d’antenne, export KML/CSV.</span>
              </p>
              <Button variant="outline" size="sm" className="h-7 shrink-0 rounded-lg px-2.5 text-[12px]" onClick={() => setExpert(true)}>
                Vue expert
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
      <RecoveryDialog serial={sonde.serial} open={reporting} onOpenChange={setReporting} />
    </div>
  );
}

/** `Stat` whose label is followed by an ⓘ explanation (same look as the shared primitive). */
function HintStat({ label, value, sub, accent, help }: Omit<ComponentProps<typeof Stat>, 'icon'> & { help: { title: string; text: string } }) {
  return (
    <div className="bg-chip min-w-0 rounded-xl px-3 py-2">
      {/* The ⓘ sits where other stats show their decorative icon, so labels keep the same room. */}
      <div className="text-faint flex min-w-0 items-center gap-1 text-[10.5px] font-medium tracking-wide uppercase">
        <HelpHint title={help.title} className="size-3 [&>svg]:size-3">
          {help.text}
        </HelpHint>
        <span className="truncate tracking-normal">{label}</span>
      </div>
      <div className="tabular truncate font-mono text-[15px] font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-dim truncate text-[11px]">{sub}</div>}
    </div>
  );
}

const COMPASS_WORD: Record<string, string> = {
  N: 'nord',
  NNE: 'nord-nord-est',
  NE: 'nord-est',
  ENE: 'est-nord-est',
  E: 'est',
  ESE: 'est-sud-est',
  SE: 'sud-est',
  SSE: 'sud-sud-est',
  S: 'sud',
  SSO: 'sud-sud-ouest',
  SO: 'sud-ouest',
  OSO: 'ouest-sud-ouest',
  O: 'ouest',
  ONO: 'ouest-nord-ouest',
  NO: 'nord-ouest',
  NNO: 'nord-nord-ouest',
};

function pressureSub(hPa: number | undefined): string | undefined {
  if (hPa === undefined || !Number.isFinite(hPa) || hPa <= 0) return undefined;
  const pct = (hPa / 1013.25) * 100;
  return pct >= 95 ? 'comme au sol' : `${pct < 10 ? pct.toFixed(1).replace('.', ',') : Math.round(pct)} % du sol`;
}

function sondeLink(serial: string) {
  return `${location.origin}${location.pathname}#s=${encodeURIComponent(serial)}`;
}

/** Native share sheet when available (mobile), otherwise copy the link. */
async function share(sonde: Sonde, landing: PredictionPoint | null, now: number, units: Units) {
  const url = sondeLink(sonde.serial);
  const flying = sonde.phase === 'ascending' || sonde.phase === 'descending';
  const text =
    flying
      ? `Radiosonde ${sonde.serial} à ${fmtAlt(sonde.last.alt, units)}${landing ? ` — atterrissage prévu ${relative(landing.time * 1000, now)}` : sonde.phase === 'ascending' ? ', en montée' : ', en descente'}`
      : sonde.phase === 'landed'
        ? `Radiosonde ${sonde.serial} au sol — dernière position ${ago(sonde.lastTime, now)}`
        : `Radiosonde ${sonde.serial} — signal perdu ${ago(sonde.lastTime, now)}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `${sonde.serial} · SondeTrack`, text, url });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // user closed the share sheet
    }
  }
  await copyText(url, 'Lien copié dans le presse-papiers');
}

/** One sentence describing the flight in plain words, e.g. "Ballon météo lâché depuis Trappes il y a 45 min, …". */
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
  // "lâché depuis Trappes il y a 45 min" (only claim a launch time when the track starts near the ground).
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
      return `${l ? `Sonde ${l}, désormais au sol` : 'Sonde au sol'} ; dernière trame reçue ${ago(sonde.lastTime, now)}.`;
    }
    case 'lost':
      return `Signal perdu ${ago(sonde.lastTime, now)} à ${alt} d’altitude : la sonde n’est plus captée par les récepteurs.`;
  }
}

function navLinks(t: { lat: number; lon: number }, me: { lat: number; lon: number } | null) {
  const ll = `${t.lat},${t.lon}`;
  return [
    { label: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${ll}` },
    { label: 'Waze', href: `https://waze.com/ul?ll=${ll}&navigate=yes` },
    { label: 'Apple Plans', href: `https://maps.apple.com/?daddr=${ll}&dirflg=d` },
    {
      label: 'OpenStreetMap',
      href: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${me ? `${me.lat},${me.lon}` : ''}%3B${ll}`,
    },
  ];
}

const snrFmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function SnrBar({ snr }: { snr: number }) {
  const level = snr >= 20 ? 4 : snr >= 12 ? 3 : snr >= 6 ? 2 : 1;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex shrink-0 cursor-default items-center gap-1.5">
          <span className="text-muted-foreground tabular font-mono text-[11px]">{snr.toFixed(0)} dB</span>
          <div className="flex h-3 items-end gap-[2px]">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cx('w-[3px] rounded-sm', i > level && 'bg-muted-foreground/25')}
                style={{ height: `${i * 25}%`, background: i <= level ? COLOURS.listener : undefined }}
              />
            ))}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">SNR {snrFmt.format(snr)} dB</TooltipContent>
    </Tooltip>
  );
}
