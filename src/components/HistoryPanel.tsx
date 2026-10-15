import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LoaderCircle, Map as MapIcon, MapPin, RotateCw } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { Centre } from '@/lib/watchPoint';
import type { Frame, PastFlight } from '@/lib/types';
import { fmtAltShort, fmtDist, fmtDuration, fmtRadius, type Units } from '@/lib/format';
import { bearing, cardinal, compass, distance } from '@/lib/geo';
import { fmtDay, fmtHour, isGlider, siteLabel } from '@/lib/sonde';
import {
  HISTORY_MAX_DAYS,
  HISTORY_OVERLAY,
  burstAltitude,
  drift,
  entryFromFrame,
  entryFromPast,
  entryFromSonde,
  entryTime,
  fetchRecentNear,
  fetchSiteFlights,
  inZone,
  mainDirection,
  median,
  openHistoryEntry,
  sitesForZone,
  toPastFlight,
  type HistoryEntry,
  type Zone,
} from '@/lib/history';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Segmented } from './ui';
import { Icon3D } from './Icon3D';
import { EmptyState, RowSkeleton } from './ListParts';
import { getMap } from './MapView';
import { RadiusPicker, nextRadius } from './RadiusPicker';

const PERIODS = ['7', '30'] as const;
type Period = (typeof PERIODS)[number];
type ZoneMode = 'me' | 'map';

const ZONE_KEY = 'sondetrack.historyZone.v1';
const PERIOD_KEY = 'sondetrack.historyPeriod.v1';
const DAY_MS = 86_400_000;
const RECENT_S = 2 * 86_400;
const STILL_FLYING_MS = 30 * 60_000;
const MIN_FOR_STATS = 5;
const PARTIAL_MAX_ALT = 3000;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function mapCenter(): { lat: number; lon: number } | null {
  const c = getMap()?.getCenter();
  return c ? { lat: Math.round(c.lat * 50) / 50, lon: Math.round(c.lng * 50) / 50 } : null;
}

function useMapCenter(active: boolean) {
  const [center, setCenter] = useState(mapCenter);
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    let attached: ReturnType<typeof getMap>;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCenter((prev) => {
        const next = mapCenter();
        return next && prev && next.lat === prev.lat && next.lon === prev.lon ? prev : next;
      }), 300);
    };
    const attach = () => {
      attached = getMap();
      if (!attached) return false;
      attached.on('moveend', update);
      update();
      return true;
    };
    const poll = attach() ? 0 : window.setInterval(() => attach() && window.clearInterval(poll), 500);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
      attached?.off('moveend', update);
    };
  }, [active]);
  return center;
}

type SiteState = PastFlight[] | 'loading' | 'error';

interface Props {
  units: Units;
  me: Centre | null;
  locating: boolean;
  onLocate: () => void;
}

export function HistoryPanel({ units, me, locating, onLocate }: Props) {
  const t = useT();
  const sites = useStore((s) => s.sites);
  const sondes = useStore((s) => s.sondes);
  const radiusKm = useStore((s) => s.settings.alerts.radiusKm);
  const now = useStore((s) => s.now);
  const { setAlerts, setSiteOverlay } = useStore.getState();
  const [mode, setModeState] = useState<ZoneMode>(() => read<ZoneMode>(ZONE_KEY, ['me', 'map'], 'me'));
  const [period, setPeriodState] = useState<Period>(() => read<Period>(PERIOD_KEY, PERIODS, '30'));
  const [attempt, setAttempt] = useState(0);
  const [bySite, setBySite] = useState<Record<string, SiteState>>({});
  const [recent, setRecent] = useState<Frame[] | null>(null);
  const center = useMapCenter(mode === 'map');

  const setMode = (m: ZoneMode) => {
    setModeState(m);
    write(ZONE_KEY, m);
    if (m === 'me' && !me) onLocate();
  };
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    write(PERIOD_KEY, p);
  };

  const origin = mode === 'me' ? (me ? { lat: me.lat, lon: me.lon } : null) : center;
  const zone: Zone | null = useMemo(
    () => (origin ? { lat: origin.lat, lon: origin.lon, radiusM: radiusKm * 1000 } : null),
    [origin?.lat, origin?.lon, radiusKm],
  );

  const candidates = useMemo(() => (zone ? sitesForZone(sites, zone) : []), [sites, zone]);
  const candidateKey = candidates.map((s) => s.id).join(',');

  useEffect(() => {
    let live = true;
    for (const site of candidates) {
      setBySite((prev) => (Array.isArray(prev[site.id]) ? prev : { ...prev, [site.id]: 'loading' }));
      fetchSiteFlights(site.id)
        .then((flights) => live && setBySite((prev) => ({ ...prev, [site.id]: flights })))
        .catch(() => live && setBySite((prev) => ({ ...prev, [site.id]: 'error' })));
    }
    return () => {
      live = false;
    };
  }, [candidateKey, attempt]);

  useEffect(() => {
    if (!zone) return;
    const ctrl = new AbortController();
    setRecent(null);
    fetchRecentNear(zone.lat, zone.lon, zone.radiusM, RECENT_S, ctrl.signal)
      .then((frames) => setRecent(frames))
      .catch(() => !ctrl.signal.aborted && setRecent([]));
    return () => ctrl.abort();
  }, [zone, attempt]);

  const days = Number(period);
  const entries = useMemo(() => {
    if (!zone) return [];
    const since = now - days * DAY_MS;
    const out: HistoryEntry[] = [];
    const archived = new Set<string>();
    for (const site of candidates) {
      const list = bySite[site.id];
      if (!Array.isArray(list)) continue;
      for (const f of list) {
        if (f.first.time < since) continue;
        if (!inZone(zone, f.last) && !inZone(zone, f.first)) continue;
        if (archived.has(f.serial)) continue;
        archived.add(f.serial);
        out.push(entryFromPast(f, site));
      }
    }
    const recentSerials = new Set<string>();
    const addRecent = (e: HistoryEntry) => {
      if (archived.has(e.serial) || recentSerials.has(e.serial) || entryTime(e) < since) return;
      recentSerials.add(e.serial);
      out.push(e);
    };
    for (const s of Object.values(sondes)) {
      if (s.archived || s.phase === 'ascending' || s.phase === 'descending') continue;
      if (inZone(zone, s.last)) addRecent(entryFromSonde(s));
    }
    for (const f of recent ?? []) {
      const live = sondes[f.serial];
      if (live && (live.phase === 'ascending' || live.phase === 'descending')) continue;
      if (live && !live.archived) {
        addRecent(entryFromSonde(live));
        continue;
      }
      if (f.alt > PARTIAL_MAX_ALT || now - Date.parse(f.datetime) < STILL_FLYING_MS) continue;
      addRecent(entryFromFrame(f));
    }
    return out.sort((a, b) => entryTime(b) - entryTime(a));
  }, [zone, candidates, bySite, recent, sondes, days, Math.floor(now / 60_000)]);

  useEffect(() => {
    setSiteOverlay(zone ? { site: HISTORY_OVERLAY, forecasts: [], past: entries.map(toPastFlight), zone } : null);
  }, [entries, zone, setSiteOverlay]);
  useEffect(
    () => () => {
      if (useStore.getState().siteOverlay?.site === HISTORY_OVERLAY) useStore.getState().setSiteOverlay(null);
    },
    [],
  );

  const pending = candidates.filter((s) => bySite[s.id] === 'loading' || bySite[s.id] === undefined).length;
  const failed = candidates.length > 0 && candidates.every((s) => bySite[s.id] === 'error');
  const loading = pending > 0 || recent === null;

  const stats = useMemo(() => {
    const full = entries.filter((e) => !e.recent);
    if (full.length < MIN_FOR_STATS) return null;
    const bursts = full.map(burstAltitude).filter((v): v is number => v !== null);
    const drifts = full.map(drift).filter((v): v is { d: number; b: number } => v !== null);
    return {
      burst: median(bursts),
      dist: median(drifts.map((x) => x.d)),
      dir: mainDirection(drifts.filter((x) => x.d > 5000).map((x) => x.b)),
    };
  }, [entries]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: HistoryEntry[] }[] = [];
    for (const e of entries) {
      const d = new Date(entryTime(e));
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(e);
      else out.push({ key, label: fmtDay(entryTime(e), now), items: [e] });
    }
    return out;
  }, [entries, Math.floor(now / 60_000)]);

  const widen = nextRadius(radiusKm);
  const refFromMe = mode === 'me' && me ? me : null;

  const controls = (
    <div className="space-y-2.5 px-5 pt-4">
      <ControlRow label={t('sidebar.history.zone')}>
        <Segmented<ZoneMode>
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'me', label: <span className="block max-w-[9rem] truncate">{me?.kind === 'point' ? me.label || t('sidebar.history.zoneMe') : t('sidebar.history.zoneMe')}</span> },
            { value: 'map', label: t('sidebar.history.zoneMap'), title: t('sidebar.history.zoneMapTitle') },
          ]}
        />
      </ControlRow>
      <RadiusPicker units={units} />
      <ControlRow label={t('sidebar.history.period')}>
        <Segmented<Period>
          size="sm"
          value={period}
          onChange={setPeriod}
          options={PERIODS.map((p) => ({ value: p, label: t('sidebar.history.days', { n: Number(p) }) }))}
        />
      </ControlRow>
    </div>
  );

  if (!zone) {
    return (
      <>
        {controls}
        {mode === 'me' && locating ? (
          <div role="status" aria-live="polite">
            <p className="flex items-center gap-2 px-5 pt-5 text-[13px]">
              <LoaderCircle className="text-primary size-4 animate-spin" />
              {t('sidebar.nearby.locating')}
            </p>
            <ul aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            art="locate"
            title={t('sidebar.history.whereTitle')}
            actions={
              <>
                <Button size="sm" onClick={onLocate}>
                  <MapPin />
                  {t('sidebar.nearby.locate')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMode('map')}>
                  <MapIcon />
                  {t('sidebar.history.useMap')}
                </Button>
              </>
            }
          >
            {t('sidebar.history.whereText')}
          </EmptyState>
        )}
      </>
    );
  }

  const summary =
    entries.length > 0 ? (
      <p className="px-5 pt-4 text-[13.5px] leading-relaxed">
        {t('sidebar.history.summaryCount', { count: entries.length, days })}
        {stats?.burst != null && <> {t('sidebar.history.summaryBurst', { alt: fmtAltShort(stats.burst, units) })}</>}
        {stats?.dist != null && (
          <>
            {' '}
            {stats.dir !== null
              ? t('sidebar.history.summaryDirection', { dir: cardinal(stats.dir), dist: fmtDist(stats.dist, units) })
              : t('sidebar.history.summaryVaried', { dist: fmtDist(stats.dist, units) })}
          </>
        )}
      </p>
    ) : null;

  let body;
  if (entries.length === 0 && loading) {
    body = (
      <div role="status" aria-live="polite">
        <p className="flex items-center gap-2 px-5 pt-5 text-[13px]">
          <LoaderCircle className="text-primary size-4 animate-spin" />
          {candidates.length > 0 ? t('sidebar.history.loadingSites', { count: candidates.length }) : t('sidebar.history.loading')}
        </p>
        <ul aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </ul>
      </div>
    );
  } else if (entries.length === 0 && failed) {
    body = (
      <EmptyState
        icon={<RotateCw />}
        title={t('sidebar.history.errorTitle')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw /> {t('sidebar.history.retry')}
          </Button>
        }
      >
        {t('sidebar.history.errorText')}
      </EmptyState>
    );
  } else if (entries.length === 0) {
    body = (
      <EmptyState
        art="landed"
        title={t('sidebar.history.emptyTitle', { radius: fmtRadius(radiusKm, units), days })}
        actions={
          <>
            {widen && (
              <Button variant="outline" size="sm" onClick={() => setAlerts({ radiusKm: widen })}>
                {t('sidebar.nearby.widen', { radius: fmtRadius(widen, units) })}
              </Button>
            )}
            {period === '7' && (
              <Button variant="ghost" size="sm" onClick={() => setPeriod('30')}>
                {t('sidebar.history.widenPeriod', { n: HISTORY_MAX_DAYS })}
              </Button>
            )}
          </>
        }
      >
        {candidates.length === 0 ? t('sidebar.history.noSites') : t('sidebar.history.emptyText')}
      </EmptyState>
    );
  } else {
    body = (
      <>
        {summary}
        {loading && (
          <p className="flex items-center gap-2 px-5 pt-2 text-[12.5px]" role="status">
            <LoaderCircle className="text-faint size-3.5 animate-spin" />
            {t('sidebar.history.loadingMore')}
          </p>
        )}
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h2 className="flex items-baseline gap-2 px-5 pt-5 pb-1 text-[14px] font-semibold">
              {g.label}
              <span className="tabular text-faint font-sans text-[12.5px] font-normal">{g.items.length}</span>
            </h2>
            <ul>
              {g.items.map((e) => (
                <HistoryRow key={`${e.serial}-${entryTime(e)}`} e={e} units={units} centre={refFromMe} />
              ))}
            </ul>
          </section>
        ))}
        <p className="text-faint px-5 pt-6 text-[12.5px] leading-relaxed">{t('sidebar.history.footnote')}</p>
      </>
    );
  }

  return (
    <>
      {controls}
      {body}
    </>
  );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  );
}

function HistoryRow({ e, units, centre }: { e: HistoryEntry; units: Units; centre: Centre | null }) {
  const t = useT();
  const hovered = useStore((st) => st.hovered === e.serial);
  const burst = burstAltitude(e);
  const d = drift(e);
  const lost = e.last.alt > 3000;
  const glider = isGlider({ type: e.type, last: { batt: e.batt } });
  const icon = glider ? (lost ? 'glider-lost' : 'glider-descending') : lost ? 'lost' : 'ascending';
  const time = fmtHour(entryTime(e));
  const status = e.launch
    ? e.site
      ? t('sidebar.history.rowFromSite', { site: siteLabel(e.site.name), time })
      : t('sidebar.history.rowLaunched', { time })
    : t('sidebar.history.rowLastSignal', { time, alt: fmtAltShort(e.last.alt, units) });
  const away = centre
    ? { distance: fmtDist(distance(centre.lat, centre.lon, e.last.lat, e.last.lon), units), direction: cardinal(bearing(centre.lat, centre.lon, e.last.lat, e.last.lon)) }
    : null;
  const where = lost
    ? e.launch
      ? t('sidebar.history.rowLostAt', { alt: fmtAltShort(e.last.alt, units) })
      : null
    : away
      ? t(centre?.kind === 'point' ? 'sidebar.status.landedNearPoint' : 'sidebar.status.landedNear', away)
      : null;
  const metrics = [
    { label: t('sidebar.history.metricBurst'), value: burst !== null ? fmtAltShort(burst, units) : '—' },
    { label: t('sidebar.history.metricDuration'), value: e.launch ? fmtDuration(e.last.time - e.launch.time) : '—' },
    { label: lost ? t('sidebar.history.metricLastHeard') : t('sidebar.history.metricLanding'), value: d ? `${fmtDist(d.d, units)} ${compass(d.b)}` : '—' },
  ];
  return (
    <li className={`border-b transition-colors last:border-b-0 ${hovered ? 'bg-surface' : ''}`}>
      <button
        type="button"
        data-nav-row
        data-testid="history-row"
        onClick={() => openHistoryEntry(e)}
        onPointerEnter={(ev) => ev.pointerType === 'mouse' && useStore.getState().setHovered(e.serial)}
        onPointerLeave={(ev) => ev.pointerType === 'mouse' && useStore.getState().setHovered(null)}
        className="hover:bg-surface focus-visible:ring-ring flex w-full items-start gap-3 py-3 pr-5 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <span className="-my-1 -ml-1.5 grid size-10 shrink-0 place-items-center">
          <Icon3D id={icon} size={40} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="tabular text-foreground block truncate text-[14.5px] leading-5 font-semibold">{e.serial}</span>
          <span className="mt-0.5 block text-[13px] leading-snug">
            {where ? t('sidebar.history.rowJoin', { a: status, b: where }) : status}
          </span>
          {e.launch && (
            <span className="mt-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-2">
              {metrics.map((m) => (
                <span key={m.label} className="min-w-0">
                  <span className="text-faint block truncate text-[12px] leading-4">{m.label}</span>
                  <span className="tabular text-foreground mt-0.5 block truncate text-[14px] leading-5 font-semibold">{m.value}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
