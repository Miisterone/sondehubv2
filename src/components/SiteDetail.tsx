import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crosshair, ExternalLink, RotateCw } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { fetchSiteForecast, siteProfile } from '@/lib/api';
import { fetchSiteFlights, mainDirection, median, openHistoryEntry } from '@/lib/history';
import type { LaunchSite, PastFlight, SiteForecast, Sonde } from '@/lib/types';
import { fmtAltShort, fmtDist, fmtVSpeed, type Units } from '@/lib/format';
import { bearing, cardinal, distance } from '@/lib/geo';
import { fmtDay, fmtHour, scheduleText, siteCountry, siteLabel, sondeTypeName, upcomingLaunches } from '@/lib/sonde';
import { PHASE_LABEL } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { IconButton, Section, Stat, cx } from './ui';
import { Icon3D, SondeIcon3D } from './Icon3D';
import { HelpHint } from './HelpHint';
import { t, useT } from '@/i18n';

const HISTORY_DAYS = 30;
const RECENT_ROWS = 8;

type Forecast = { t: number; state: 'loading' } | { t: number; state: 'ok'; data: SiteForecast } | { t: number; state: 'error' };
type History = { state: 'loading' } | { state: 'error' } | { state: 'ok'; flights: PastFlight[] };

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>, signal: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

function fromSite(site: LaunchSite, lat: number, lon: number, units: Units): string {
  const d = distance(site.lat, site.lon, lat, lon);
  return d < 1500 ? t('map.site.nearSite') : t('map.site.fromSite', { dist: fmtDist(d, units), dir: cardinal(bearing(site.lat, site.lon, lat, lon)) });
}

function launchedHere(s: Sonde, site: LaunchSite, reverseSite: string | null | undefined): boolean {
  if (reverseSite) return reverseSite === site.id;
  const p = s.track[0];
  return !!p && p[2] < 3000 && distance(p[1], p[0], site.lat, site.lon) < 30_000;
}

export function SiteDetail({ id }: { id: string }) {
  const site = useStore((s) => s.sites.find((x) => x.id === id));
  const sondes = useStore((s) => s.sondes);
  const reverse = useStore((s) => s.reverse);
  const units = useStore((s) => s.settings.units);
  const me = useStore((s) => s.userLocation);
  const now = useStore((s) => s.now);
  const { selectSite, select, requestFly, setSiteOverlay } = useStore.getState();
  const t = useT();
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [instant, setInstant] = useState(0);
  const [history, setHistory] = useState<History>({ state: 'loading' });
  const [historyTry, setHistoryTry] = useState(0);

  useEffect(() => {
    if (!site) return;
    const start = Date.now();
    const times = instant ? [instant] : upcomingLaunches(site.times, start);
    setForecasts(times.map((t) => ({ t, state: 'loading' })));
    if (!times.length) return;
    const ctrl = new AbortController();
    void pool(
      times,
      3,
      async (t) => {
        try {
          const data = await fetchSiteForecast(site, t, ctrl.signal);
          if (!ctrl.signal.aborted) setForecasts((prev) => prev.map((f) => (f.t === t ? { t, state: 'ok', data } : f)));
        } catch {
          if (!ctrl.signal.aborted) setForecasts((prev) => prev.map((f) => (f.t === t ? { t, state: 'error' } : f)));
        }
      },
      ctrl.signal,
    );
    return () => ctrl.abort();
  }, [site, instant]);

  useEffect(() => {
    if (!site) return;
    const ctrl = new AbortController();
    setHistory({ state: 'loading' });
    const since = Date.now() - HISTORY_DAYS * 86_400_000;
    fetchSiteFlights(site.id)
      .then((list) => {
        if (ctrl.signal.aborted) return;
        const end = Date.now();
        const flights = list.filter((f) => f.first.time >= since && f.first.time <= end).sort((a, b) => b.first.time - a.first.time);
        setHistory({ state: 'ok', flights });
      })
      .catch(() => !ctrl.signal.aborted && setHistory({ state: 'error' }));
    return () => ctrl.abort();
  }, [site, historyTry]);

  const ready = useMemo(() => forecasts.flatMap((f) => (f.state === 'ok' ? [f.data] : [])), [forecasts]);
  const past = history.state === 'ok' ? history.flights : null;

  useEffect(() => {
    setSiteOverlay({ site: id, forecasts: ready, past: past ?? [] });
  }, [id, ready, past, setSiteOverlay]);
  useEffect(() => () => useStore.getState().setSiteOverlay(null), []);

  const recent = useMemo(() => {
    if (!site) return [];
    return Object.values(sondes)
      .filter((s) => launchedHere(s, site, reverse[s.serial]?.site))
      .sort((a, b) => (b.track[0]?.[3] ?? 0) - (a.track[0]?.[3] ?? 0))
      .slice(0, 6);
  }, [sondes, reverse, site]);

  const stats = useMemo(() => {
    if (!site || !past?.length) return null;
    const dists = past.map((f) => distance(site.lat, site.lon, f.last.lat, f.last.lon));
    const far = dists.reduce((best, d, i) => (d > dists[best] ? i : best), 0);
    return {
      burst: median(past.map((f) => f.top.alt)),
      landing: median(dists),
      direction: mainDirection(past.filter((_, i) => dists[i] > 5000).map((f) => bearing(site.lat, site.lon, f.last.lat, f.last.lon))),
      farthest: { flight: past[far], d: dists[far] },
    };
  }, [past, site]);

  if (!site) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <IconButton label={t('map.common.backToList')} side="bottom" onClick={() => selectSite(null)}>
            <ArrowLeft />
          </IconButton>
          <Skeleton className="bg-surface h-4 w-40" />
        </div>
      </div>
    );
  }

  const profile = siteProfile(site);
  const country = siteCountry(site.name);
  const schedule = scheduleText(site.times, now);
  const types = [...new Set(site.types.map(sondeTypeName))];
  const wmo = /^\d{5}$/.test(site.id);

  return (
    <div className="animate-in flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
        <IconButton label={t('map.common.backToList')} side="bottom" onClick={() => selectSite(null)}>
          <ArrowLeft />
        </IconButton>
        <Icon3D id="launch" size={38} className="-my-1.5" />
        <div className="ml-0.5 min-w-0 flex-1">
          <h2 className="truncate text-[16px] leading-tight font-semibold">{siteLabel(site.name)}</h2>
          <div className="truncate text-[12.5px]">
            {wmo ? t('map.site.subtitleWmo', { place: country ?? t('map.site.launchSite'), id: site.id }) : (country ?? t('map.site.launchSite'))}
          </div>
        </div>
        <IconButton label={t('map.site.centre')} side="bottom" onClick={() => requestFly(site.lon, site.lat, 8)}>
          <Crosshair className="size-[18px]" />
        </IconButton>
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div className="space-y-8 px-5 pt-5 pb-10">
          <div className="space-y-3 text-[13.5px] leading-relaxed">
            <p>{schedule ? t('map.site.introSchedule', { schedule }) : t('map.site.intro')}</p>
            {!schedule && <p>{t('map.site.noSchedule')}</p>}
            {(types.length > 0 || site.alt !== undefined) && (
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                {types.length > 0 && <Stat label={t('map.site.sondeTypes')} value={types.join(', ')} />}
                {site.alt !== undefined && <Stat label={t('map.site.altitude')} value={fmtAltShort(site.alt, units)} />}
              </div>
            )}
            {site.notes && <p className="text-[12.5px]">{site.notes}</p>}
          </div>

          {recent.length > 0 && (
            <Section title={t('map.site.recent')} className="border-t pt-6">
              <ul className="-mx-2">
                {recent.map((s) => (
                  <li key={s.serial}>
                    <button
                      type="button"
                      onClick={() => select(s.serial, true)}
                      className="hover:bg-surface focus-visible:ring-ring flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2"
                    >
                      <SondeIcon3D sonde={s} size={34} className="-my-1" />
                      <span className="min-w-0 flex-1">
                        <span className="tabular text-foreground block truncate text-[13.5px] font-semibold">{s.serial}</span>
                        <span className="block truncate text-[12.5px]">
                          {t('map.site.recentRow', { phase: PHASE_LABEL[s.phase], alt: fmtAltShort(s.last.alt, units) })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={
              <>
                {instant ? t('map.site.forecastNow') : t('map.site.forecastNext')}
                <HelpHint title={t('map.site.forecastHelpTitle')}>
                  {t('map.site.forecastHelp', {
                    ascent: fmtVSpeed(profile.ascentRate, units, false),
                    burst: fmtAltShort(profile.burstAltitude, units),
                    descent: fmtVSpeed(profile.descentRate, units, false),
                  })}
                </HelpHint>
              </>
            }
            className="border-t pt-6"
          >
            {forecasts.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed">{t('map.site.simulateIntro')}</p>
                <Button variant="outline" size="sm" className="text-[13px]" onClick={() => setInstant(Date.now() + 5 * 60_000)}>
                  {t('map.site.simulate')}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed">{t('map.site.forecastIntro')}</p>
                <ul className="divide-y rounded-md border">
                  {forecasts.map((f, i) => (
                    <li key={f.t}>
                      <ForecastRow f={f} site={site} units={units} me={me} now={now} next={i === 0} onFly={(lat, lon) => requestFly(lon, lat, 9)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section title={t('map.site.history', { days: HISTORY_DAYS })} className="border-t pt-6">
            {history.state === 'loading' ? (
              <div className="space-y-3" aria-busy>
                <Skeleton className="bg-surface h-14 w-full rounded-md" />
                <Skeleton className="bg-surface h-24 w-full rounded-md" />
              </div>
            ) : history.state === 'error' ? (
              <div className="space-y-3">
                <p className="text-[13px]">{t('map.site.historyError')}</p>
                <Button variant="outline" size="sm" className="text-[13px]" onClick={() => setHistoryTry((n) => n + 1)}>
                  <RotateCw /> {t('map.site.retry')}
                </Button>
              </div>
            ) : !past?.length || !stats ? (
              <p className="text-[13px] leading-relaxed">{t('map.site.historyEmpty', { days: HISTORY_DAYS })}</p>
            ) : (
              <div className="space-y-5">
                <p className="text-[13.5px] leading-relaxed">
                  {t('map.site.flightsTracked', { count: past.length })}{' '}
                  {stats.direction !== null
                    ? stats.landing !== null
                      ? t('map.site.landingDirectionMedian', { dir: cardinal(stats.direction), dist: fmtDist(stats.landing, units) })
                      : t('map.site.landingDirection', { dir: cardinal(stats.direction) })
                    : stats.landing !== null
                      ? t('map.site.landingVariedMedian', { dist: fmtDist(stats.landing, units) })
                      : t('map.site.landingVaried')}
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label={t('map.site.burst')} value={stats.burst !== null ? fmtAltShort(stats.burst, units) : '—'} sub={t('map.site.median')} />
                  <Stat label={t('map.site.landing')} value={stats.landing !== null ? fmtDist(stats.landing, units) : '—'} sub={t('map.site.fromSiteMedian')} />
                  <Stat label={t('map.site.farthest')} value={fmtDist(stats.farthest.d, units)} sub={fmtDay(stats.farthest.flight.first.time, now)} />
                </div>
                <ul className="divide-y rounded-md border">
                  {past.slice(0, RECENT_ROWS).map((f) => (
                    <li key={f.serial}>
                      <button
                        type="button"
                        onClick={() => openHistoryEntry({ serial: f.serial, launch: f.first, last: f.last })}
                        className="hover:bg-surface focus-visible:ring-ring flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground block truncate text-[13px] font-semibold">
                            {t('map.site.dayTime', { day: fmtDay(f.first.time, now), time: fmtHour(f.first.time) })}
                          </span>
                          <span className="block text-[12.5px] leading-snug">
                            {t('map.site.pastRow', { alt: fmtAltShort(f.top.alt, units), where: fromSite(site, f.last.lat, f.last.lon, units) })}
                          </span>
                        </span>
                        <span className="tabular text-faint shrink-0 pt-0.5 text-[12px]">{f.serial}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[12.5px] leading-relaxed">{t('map.site.greyDots')}</p>
              </div>
            )}
          </Section>

          <div className="border-t pt-6">
            <Button variant="link" size="xs" asChild className="-ml-2 h-auto text-[13px] font-normal">
              <a href={`https://sondehub.org/#!site=${encodeURIComponent(site.id)}`} target="_blank" rel="noreferrer">
                <ExternalLink /> {t('map.site.viewOnSondeHub')}
              </a>
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function ForecastRow({
  f,
  site,
  units,
  me,
  now,
  next,
  onFly,
}: {
  f: Forecast;
  site: LaunchSite;
  units: Units;
  me: { lat: number; lon: number } | null;
  now: number;
  next: boolean;
  onFly: (lat: number, lon: number) => void;
}) {
  const t = useT();
  const when = (
    <span className={cx('block truncate text-[13px] font-semibold', next ? 'text-foreground' : 'text-foreground/85')}>
      {t('map.site.dayTime', { day: fmtDay(f.t, now), time: fmtHour(f.t) })}
    </span>
  );
  if (f.state === 'loading') {
    return (
      <div className="px-3 py-2.5">
        {when}
        <Skeleton className="bg-surface mt-1.5 h-3.5 w-48 rounded-sm" />
      </div>
    );
  }
  if (f.state === 'error') {
    return (
      <div className="px-3 py-2.5">
        {when}
        <span className="block text-[12.5px]">{t('map.site.forecastUnavailable')}</span>
      </div>
    );
  }
  const l = f.data.landing;
  const fromMe = me ? distance(me.lat, me.lon, l.lat, l.lon) : null;
  return (
    <button
      type="button"
      onClick={() => onFly(l.lat, l.lon)}
      className="hover:bg-surface focus-visible:ring-ring block w-full px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      {when}
      <span className="block text-[12.5px] leading-snug">
        {fromMe !== null
          ? t('map.site.forecastRowFromMe', { time: fmtHour(l.time * 1000), where: fromSite(site, l.lat, l.lon, units), dist: fmtDist(fromMe, units) })
          : t('map.site.forecastRow', { time: fmtHour(l.time * 1000), where: fromSite(site, l.lat, l.lon, units) })}
      </span>
    </button>
  );
}
