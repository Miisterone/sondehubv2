import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Bell, BellRing, ChevronDown, Info, LoaderCircle, LocateFixed, MapPin, RotateCw, Search, SearchX, SlidersHorizontal, Star, X } from 'lucide-react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { toast } from 'sonner';
import type { MapMouseEvent } from 'maplibre-gl';
import { DURATION_MS, useStore, type Duration } from '@/store/useStore';
import type { FlightPhase, Prediction, Sonde } from '@/lib/types';
import { makeVisible, typeKey, usefulPrediction } from '@/lib/filter';
import { ago, fmtAltShort, fmtClock, fmtCoord, fmtDist, fmtFreq, fmtHSpeed, fmtRadius, fmtTemp, fmtVSpeed, relative, type Units } from '@/lib/format';
import { bearing, cardinal, compass, distance } from '@/lib/geo';
import { findLaunch, isGlider, siteLabel, verticalSpeed, type Launch } from '@/lib/sonde';
import { locateUser } from '@/lib/geolocation';
import { isPickClick, useNearbyCentre, type Centre } from '@/lib/watchPoint';
import { disableAlerts, enableAlerts } from '@/lib/alerts';
import { PHASE_LABEL } from '@/lib/icons';
import { t as translate, useT, type TKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerDescription, DrawerPortal, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconButton, Logo, Segmented, Toggle, cx } from './ui';
import { Icon3D, SondeIcon3D } from './Icon3D';
import { EmptyState, RowSkeleton } from './ListParts';
import { HistoryPanel } from './HistoryPanel';
import { SondeDetail } from './SondeDetail';
import { SiteDetail } from './SiteDetail';
import { ListenerDetail } from './ListenerDetail';
import { StatusPill } from './StatusPill';
import { LanguageSelect } from './LanguageSelect';
import { FlightGuide } from './FlightGuide';
import { UpcomingLaunches } from './UpcomingLaunches';
import { getMap } from './MapView';
import { CentreBar, PointEditor } from './WatchPointPicker';
import { RadiusPicker, nextRadius } from './RadiusPicker';
import { WhatsNew } from './WhatsNew';
import { NEARBY_EVENT, SHEET_EVENT, TAB_EVENT, type SheetSnap, type SidebarTab } from '@/lib/tour';

const PHASES: FlightPhase[] = ['ascending', 'descending', 'landed', 'lost'];

const SNAPS: number[] = [0.24, 0.55, 0.9];
const [PEEK, HALF, FULL] = SNAPS;

const TAPPABLE_LAYERS = [
  'sondes-air',
  'sondes-ground',
  'sondes-ground-dots',
  'tracks-line',
  'track-selected-line',
  'pred-points-icons',
  'sites-icons',
  'recoveries-icons',
  'listeners-icons',
  'chase-icons',
  'listeners-dots',
  'site-past-dots',
];

const MAX_ROWS = 300;
const ALL_TYPES = '__all';

type Tab = SidebarTab;
type GeoState = 'idle' | 'locating' | 'failed';

const TAB_KEY = 'sondetrack.tab.v1';
const HINT_KEY = 'sondetrack.listHint.v1';

const DURATION_LABEL: Record<Duration, string> = {
  get '1h'() {
    return translate('sidebar.duration.hours', { n: 1 });
  },
  get '3h'() {
    return translate('sidebar.duration.hours', { n: 3 });
  },
  get '6h'() {
    return translate('sidebar.duration.hours', { n: 6 });
  },
  get '12h'() {
    return translate('sidebar.duration.hours', { n: 12 });
  },
  get '1d'() {
    return translate('sidebar.duration.hours', { n: 24 });
  },
};
const NO_DATA_KEY: Record<Duration, TKey> = {
  '1h': 'sidebar.following.noData1h',
  '3h': 'sidebar.following.noData3h',
  '6h': 'sidebar.following.noData6h',
  '12h': 'sidebar.following.noData12h',
  '1d': 'sidebar.following.noData1d',
};
const HISTORY_KEY: Record<Duration, TKey> = {
  '1h': 'sidebar.filters.history1h',
  '3h': 'sidebar.filters.history3h',
  '6h': 'sidebar.filters.history6h',
  '12h': 'sidebar.filters.history12h',
  '1d': 'sidebar.filters.history1d',
};

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function readTab(): Tab {
  const t = readKey(TAB_KEY);
  return t === 'nearby' || t === 'following' || t === 'history' ? t : 'flying';
}

async function geoGranted(): Promise<boolean> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    return p?.state === 'granted';
  } catch {
    return false;
  }
}

export function Sidebar({ onAbout }: { onAbout: () => void }) {
  const selected = useStore((s) => s.selected);
  const selectedSite = useStore((s) => s.selectedSite);
  const selectedListener = useStore((s) => s.selectedListener);
  const isMobile = useIsMobile();
  const [snap, setSnap] = useState(PEEK);
  const [tab, setTabState] = useState<Tab>(readTab);
  const [geo, setGeo] = useState<GeoState>('idle');
  const [hintSeen, setHintSeen] = useState(() => readKey(HINT_KEY) === '1');

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    writeKey(TAB_KEY, t);
  }, []);

  useEffect(() => {
    if (isMobile && (selected || selectedSite || selectedListener)) setSnap((s) => (s === PEEK ? HALF : s));
  }, [selected, selectedSite, selectedListener, isMobile]);

  const dismissHint = useCallback(() => {
    setHintSeen(true);
    writeKey(HINT_KEY, '1');
  }, []);

  useEffect(() => {
    if (selected && !hintSeen) dismissHint();
  }, [selected, hintSeen, dismissHint]);

  const locate = useCallback(() => {
    if (useStore.getState().userLocation) return;
    setGeo('locating');
    void locateUser({ fly: false }).then((ok) => setGeo(ok ? 'idle' : 'failed'));
  }, []);

  const locateIfAllowed = useCallback(() => {
    const st = useStore.getState();
    if (st.userLocation || st.settings.watchPoint) return;
    void geoGranted().then((ok) => ok && locate());
  }, [locate]);

  const switchToGps = useCallback(() => {
    if (useStore.getState().userLocation) {
      useStore.getState().setWatchPoint(null);
      return;
    }
    setGeo('locating');
    void locateUser({ fly: false }).then((ok) => {
      setGeo(ok ? 'idle' : 'failed');
      if (ok) useStore.getState().setWatchPoint(null);
    });
  }, []);

  useEffect(() => {
    const initial = readTab();
    if (initial === 'nearby' || initial === 'history') locateIfAllowed();
  }, [locateIfAllowed]);

  useEffect(() => {
    const on = () => {
      useStore.getState().select(null);
      setTab('nearby');
      if (!useStore.getState().settings.watchPoint) locate();
      setSnap((s) => (s === PEEK ? HALF : s));
    };
    window.addEventListener(NEARBY_EVENT, on);
    return () => window.removeEventListener(NEARBY_EVENT, on);
  }, [locate, setTab]);

  useEffect(() => {
    const on = (e: Event) => {
      const want = (e as CustomEvent<Tab>).detail;
      const st = useStore.getState();
      st.select(null);
      st.selectSite(null);
      st.selectListener(null);
      setTab(want);
      if (want === 'nearby' || want === 'history') locateIfAllowed();
      setSnap((s) => (s === PEEK ? HALF : s));
    };
    window.addEventListener(TAB_EVENT, on);
    return () => window.removeEventListener(TAB_EVENT, on);
  }, [locateIfAllowed, setTab]);

  useEffect(() => {
    const on = (e: Event) => {
      const want = (e as CustomEvent<SheetSnap>).detail;
      setSnap(want === 'full' ? FULL : want === 'half' ? HALF : PEEK);
    };
    window.addEventListener(SHEET_EVENT, on);
    return () => window.removeEventListener(SHEET_EVENT, on);
  }, []);

  const snapBeforePick = useRef<number | null>(null);
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.pickingPoint === prev.pickingPoint) return;
        if (s.pickingPoint) {
          setSnap((cur) => {
            snapBeforePick.current = cur;
            return PEEK;
          });
          return;
        }
        const back = snapBeforePick.current;
        snapBeforePick.current = null;
        if (s.settings.watchPoint !== prev.settings.watchPoint) {
          setTab('nearby');
          setSnap(HALF);
        } else if (back !== null) setSnap(back);
      }),
    [setTab],
  );

  useEffect(() => {
    if (!isMobile) return;
    let attached: ReturnType<typeof getMap>;
    const onClick = (e: MapMouseEvent) => {
      if (isPickClick(e) || useStore.getState().pickingPoint) return;
      const map = e.target;
      const layers = TAPPABLE_LAYERS.filter((id) => map.getLayer(id));
      const hit = layers.length > 0 && map.queryRenderedFeatures(e.point, { layers }).length > 0;
      if (!hit) setSnap(PEEK);
    };
    const attach = () => {
      attached = getMap();
      attached?.on('click', onClick);
      return attached !== undefined;
    };
    const timer = attach() ? undefined : window.setInterval(() => attach() && window.clearInterval(timer), 500);
    return () => {
      window.clearInterval(timer);
      attached?.off('click', onClick);
    };
  }, [isMobile]);

  const content = selected ? (
    <SondeDetail serial={selected} />
  ) : selectedSite ? (
    <SiteDetail id={selectedSite} />
  ) : selectedListener ? (
    <ListenerDetail callsign={selectedListener} />
  ) : (
    <ListPanel
      onAbout={onAbout}
      onFocusSearch={() => isMobile && setSnap(FULL)}
      scrollLocked={isMobile && snap !== FULL}
      tab={tab}
      onTab={(t) => {
        setTab(t);
        if (t === 'nearby' || t === 'history') locateIfAllowed();
      }}
      geo={geo}
      onLocate={locate}
      onUseGps={switchToGps}
      showHint={!hintSeen}
      onDismissHint={dismissHint}
    />
  );

  if (!isMobile) {
    return (
      <aside data-tour="sidebar" className="bg-background pointer-events-auto absolute inset-y-0 left-0 z-20 flex w-[380px] flex-col overflow-hidden border-r">
        {content}
      </aside>
    );
  }
  return (
    <BottomSheet snap={snap} onSnapChange={setSnap}>
      {content}
    </BottomSheet>
  );
}

function BottomSheet({ snap, onSnapChange, children }: { snap: number; onSnapChange: (s: number) => void; children: ReactNode }) {
  const dragged = useRef(false);
  const tr = useT();
  useUnhideOutsideSheet();
  const cycle = () => {
    if (dragged.current) return;
    onSnapChange(snap === PEEK ? HALF : snap === HALF ? FULL : PEEK);
  };

  return (
    <Drawer
      open
      modal={false}
      dismissible={false}
      noBodyStyles
      snapPoints={SNAPS}
      activeSnapPoint={snap}
      setActiveSnapPoint={(s) => typeof s === 'number' && onSnapChange(s)}
      onDrag={() => (dragged.current = true)}
    >
      <DrawerPortal>
        <DrawerPrimitive.Content
          role="region"
          data-tour="sidebar"
          className="bg-background pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex h-full flex-col rounded-t-lg border-t outline-none"
        >
          <DrawerTitle className="sr-only">{tr('sidebar.sheet.title')}</DrawerTitle>
          <DrawerDescription className="sr-only">{tr('sidebar.sheet.description')}</DrawerDescription>
          <div
            className="flex min-h-0 flex-col transition-[height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ height: `${snap * 100}%` }}
          >
            <button
              type="button"
              aria-label={snap === FULL ? tr('sidebar.sheet.collapse') : tr('sidebar.sheet.expand')}
              onPointerDown={() => (dragged.current = false)}
              onClick={cycle}
              className="flex h-5 w-full shrink-0 cursor-grab items-end justify-center outline-none"
            >
              <span className="bg-border h-1 w-9 rounded-full" />
            </button>
            <div className="min-h-0 flex-1">{children}</div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}

function useUnhideOutsideSheet() {
  useEffect(() => {
    const realModalOpen = () => document.querySelector('[role="dialog"][data-state="open"]') !== null;
    const unhide = () => {
      if (realModalOpen()) return;
      document.querySelectorAll('[data-aria-hidden="true"]').forEach((el) => {
        el.removeAttribute('aria-hidden');
        el.removeAttribute('data-aria-hidden');
      });
    };
    unhide();
    const mo = new MutationObserver(unhide);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'data-state'] });
    return () => mo.disconnect();
  }, []);
}

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

const rowId = (serial: string) => `sonde-row-${serial}`;
const isTouch = () => window.matchMedia('(hover: none)').matches;

interface Metric {
  label: string;
  value: string;
}

interface Item {
  serial: string;
  sonde?: Sonde;
  status: string;
  strong?: boolean;
  metrics?: Metric[];
}

interface Group {
  id: string;
  title?: string;
  items: Item[];
}

const STALE_MS = 60_000;

function sentence(parts: (string | null | undefined | false)[]): string {
  const s = parts.filter(Boolean).join(translate('sidebar.status.separator'));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function originText(launch: Launch | null, me: Centre | null, units: Units, now: number): string | null {
  if (!launch) return null;
  const at = me ? null : ago(launch.t, now);
  if (launch.fromGround) {
    if (launch.site) {
      const site = siteLabel(launch.site);
      return at ? translate('sidebar.origin.fromSiteAgo', { site, ago: at }) : translate('sidebar.origin.fromSite', { site });
    }
    return at ? translate('sidebar.origin.launchedAgo', { ago: at }) : null;
  }
  if (launch.estimated) {
    if (launch.site) {
      const site = siteLabel(launch.site);
      return at ? translate('sidebar.origin.probablyFromSiteAgo', { site, ago: at }) : translate('sidebar.origin.probablyFromSite', { site });
    }
    if (launch.near) {
      const params = { distance: fmtDist(launch.near.d, units), direction: cardinal(launch.near.bearing), site: siteLabel(launch.near.site) };
      return at ? translate('sidebar.origin.probablyNearAgo', { ...params, ago: at }) : translate('sidebar.origin.probablyNear', params);
    }
  }
  return null;
}

function describe(s: Sonde, pred: Prediction | null, launch: Launch | null, me: Centre | null, units: Units, now: number): Item {
  const base = { serial: s.serial, sonde: s };
  const pt = me?.kind === 'point';
  const landing = pred?.landing ?? null;
  const alt = fmtAltShort(s.last.alt, units);
  const away = (lat: number, lon: number) =>
    me ? { distance: fmtDist(distance(me.lat, me.lon, lat, lon), units), direction: cardinal(bearing(me.lat, me.lon, lat, lon)) } : null;
  const from = originText(launch, me, units, now);
  const stale = now - s.lastTime > STALE_MS ? translate('sidebar.status.lastSignal', { ago: ago(s.lastTime, now) }) : null;
  const vv = verticalSpeed(s);
  const speed = vv === undefined ? '—' : fmtVSpeed(Math.abs(vv), units, false);
  const glider = isGlider(s);
  const home = {
    label: translate('sonde.trajectory.fromLaunch'),
    value: launch?.point ? fmtDist(distance(s.last.lat, s.last.lon, launch.point.lat, launch.point.lon), units) : '—',
  };

  switch (s.phase) {
    case 'ascending': {
      const where = away(s.last.lat, s.last.lon);
      return {
        ...base,
        status: sentence([where && translate(pt ? 'sidebar.status.nearPoint' : 'sidebar.status.near', where), from, stale]) || translate('sidebar.status.ascending'),
        metrics: [
          { label: translate('sidebar.metric.altitude'), value: alt },
          { label: translate('sidebar.metric.ascent'), value: speed },
          glider
            ? home
            : {
                label: translate('sidebar.metric.burst'),
                value: pred && pred.burstAltitude > s.last.alt ? translate('sidebar.metric.burstAt', { altitude: fmtAltShort(pred.burstAltitude, units) }) : '—',
              },
        ],
      };
    }
    case 'descending': {
      const where = landing ? away(landing.lat, landing.lon) : away(s.last.lat, s.last.lon);
      const t = landing ? landing.time * 1000 : 0;
      return {
        ...base,
        status:
          sentence([
            where &&
              (landing
                ? translate(pt ? 'sidebar.status.landingNearPoint' : 'sidebar.status.landingNear', where)
                : translate(pt ? 'sidebar.status.nearPoint' : 'sidebar.status.near', where)),
            from,
            stale,
          ]) ||
          translate(glider ? 'sidebar.status.gliding' : 'sidebar.status.descending'),
        strong: !!(landing && where),
        metrics: [
          { label: translate('sidebar.metric.altitude'), value: alt },
          { label: translate('sidebar.metric.descent'), value: speed },
          glider
            ? home
            : { label: translate('sidebar.metric.landing'), value: landing ? (t > now ? relative(t, now) : translate('sidebar.metric.imminent')) : '—' },
        ],
      };
    }
    case 'landed': {
      if (landing) {
        const where = away(landing.lat, landing.lon);
        return {
          ...base,
          status: sentence([
            where ? translate(pt ? 'sidebar.status.probablyLandedNearPoint' : 'sidebar.status.probablyLandedNear', where) : translate('sidebar.status.probablyLanded'),
            translate('sidebar.status.signalLost', { ago: ago(s.lastTime, now) }),
          ]),
        };
      }
      const where = away(s.last.lat, s.last.lon);
      return {
        ...base,
        status: sentence([
          where ? translate(pt ? 'sidebar.status.landedNearPoint' : 'sidebar.status.landedNear', where) : translate('sidebar.status.landed'),
          translate('sidebar.status.lastSignal', { ago: ago(s.lastTime, now) }),
        ]),
      };
    }
    case 'lost': {
      const where = away(s.last.lat, s.last.lon);
      return {
        ...base,
        status: sentence([translate('sidebar.status.lostAt', { ago: ago(s.lastTime, now), altitude: alt }), where && translate('sidebar.status.near', where)]),
      };
    }
  }
}

interface ListProps {
  onAbout: () => void;
  onFocusSearch: () => void;
  scrollLocked: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  geo: GeoState;
  onLocate: () => void;
  onUseGps: () => void;
  showHint: boolean;
  onDismissHint: () => void;
}

function ListPanel({ onAbout, onFocusSearch, scrollLocked, tab, onTab, geo, onLocate, onUseGps, showHint, onDismissHint }: ListProps) {
  const sondes = useStore((s) => s.sondes);
  const predictions = useStore((s) => s.predictions);
  const query = useStore((s) => s.query);
  const phaseFilter = useStore((s) => s.phaseFilter);
  const typeFilter = useStore((s) => s.typeFilter);
  const units = useStore((s) => s.settings.units);
  const favourites = useStore((s) => s.settings.favourites);
  const alerts = useStore((s) => s.settings.alerts);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const me = useNearbyCentre();
  const now = useStore((s) => s.now);
  const sites = useStore((s) => s.sites);
  const reverse = useStore((s) => s.reverse);
  const duration = useStore((s) => s.settings.duration);
  const { setQuery, setAlerts, select } = useStore.getState();
  const tr = useT();
  const searchRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showGround, setShowGround] = useState(false);
  const [editingPoint, setEditingPoint] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = useMemo(() => Object.values(sondes).filter((s) => !s.archived), [sondes]);
  const visible = useMemo(() => makeVisible(query, phaseFilter, typeFilter), [query, phaseFilter, typeFilter]);
  const predOf = useCallback(
    (s: Sonde) => {
      const p = predictions[s.serial];
      return usefulPrediction(s, p) ? p : null;
    },
    [predictions],
  );
  const landingOf = useCallback((s: Sonde) => predOf(s)?.landing ?? null, [predOf]);
  const launches = useMemo(() => new Map<string, { t0: number; rev: unknown; launch: Launch | null }>(), [sites]);
  const launchOf = useCallback(
    (s: Sonde) => {
      const t0 = s.track[0]?.[3] ?? -1;
      const rev = reverse[s.serial];
      const hit = launches.get(s.serial);
      if (hit && hit.t0 === t0 && hit.rev === rev) return hit.launch;
      const launch = findLaunch(s, sites, rev);
      launches.set(s.serial, { t0, rev, launch });
      return launch;
    },
    [launches, sites, reverse],
  );
  const item = useCallback((s: Sonde) => describe(s, predOf(s), launchOf(s), me, units, now), [predOf, launchOf, me, units, now, tr]);

  const counts = useMemo(() => {
    const c: Record<FlightPhase, number> = { ascending: 0, descending: 0, landed: 0, lost: 0 };
    for (const s of all) c[s.phase]++;
    return c;
  }, [all]);

  const types = useMemo(() => {
    const m = new Map<string, { count: number; maker?: string }>();
    for (const s of all) {
      const k = typeKey(s);
      const e = m.get(k);
      if (e) e.count++;
      else m.set(k, { count: 1, maker: s.manufacturer && s.manufacturer !== k ? s.manufacturer : undefined });
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [all]);

  const results = useMemo(() => {
    if (!query.trim()) return null;
    const rank = (s: Sonde) => (s.phase === 'descending' ? 0 : s.phase === 'ascending' ? 1 : 2);
    return all
      .filter(visible)
      .sort((a, b) => rank(a) - rank(b) || b.lastTime - a.lastTime)
      .slice(0, MAX_ROWS)
      .map(item);
  }, [query, all, visible, item]);

  const flying = useMemo(() => {
    const desc: Sonde[] = [];
    const glide: Sonde[] = [];
    const asc: Sonde[] = [];
    const ground: Sonde[] = [];
    for (const s of all) {
      if (!visible(s)) continue;
      if (s.phase === 'descending') (isGlider(s) ? glide : desc).push(s);
      else if (s.phase === 'ascending') asc.push(s);
      else ground.push(s);
    }
    const eta = (s: Sonde) => landingOf(s)?.time ?? Infinity;
    desc.sort((a, b) => eta(a) - eta(b) || a.last.alt - b.last.alt);
    glide.sort((a, b) => a.last.alt - b.last.alt);
    asc.sort((a, b) => b.last.alt - a.last.alt);
    ground.sort((a, b) => b.lastTime - a.lastTime);
    return { desc, glide, asc, ground };
  }, [all, visible, landingOf]);

  const nearby = useMemo(() => {
    if (!me) return null;
    const radiusM = alerts.radiusKm * 1000;
    const landing: { s: Sonde; t: number }[] = [];
    const overhead: { s: Sonde; d: number }[] = [];
    const ground: { s: Sonde; d: number }[] = [];
    for (const s of all) {
      if (!visible(s)) continue;
      const l = landingOf(s);
      const dNow = distance(me.lat, me.lon, s.last.lat, s.last.lon);
      const dLand = l ? distance(me.lat, me.lon, l.lat, l.lon) : Infinity;
      if (s.phase === 'ascending' || s.phase === 'descending') {
        if (l && dLand <= radiusM) landing.push({ s, t: l.time });
        else if (dNow <= radiusM) overhead.push({ s, d: dNow });
      } else {
        const d = Math.min(dNow, dLand);
        if (d <= radiusM) ground.push({ s, d });
      }
    }
    landing.sort((a, b) => a.t - b.t);
    overhead.sort((a, b) => a.d - b.d);
    ground.sort((a, b) => a.d - b.d);
    const pt = me.kind === 'point';
    const out: Group[] = [
      { id: 'landing', title: tr(pt ? 'sidebar.groups.landingNearPoint' : 'sidebar.groups.landingNearby'), items: landing.map((x) => item(x.s)) },
      { id: 'overhead', title: tr(pt ? 'sidebar.groups.flyingNearPoint' : 'sidebar.groups.flyingNearby'), items: overhead.map((x) => item(x.s)) },
      { id: 'ground', title: tr(pt ? 'sidebar.groups.groundNearPoint' : 'sidebar.groups.groundNearby'), items: ground.map((x) => item(x.s)) },
    ];
    return out.filter((g) => g.items.length > 0);
  }, [me, all, visible, landingOf, item, alerts.radiusKm, tr]);

  const followed = useMemo(
    () =>
      favourites.map((serial): Item => {
        const s = sondes[serial];
        return s ? item(s) : { serial, status: tr(NO_DATA_KEY[duration]) };
      }),
    [favourites, sondes, item, duration, tr],
  );

  const groups: Group[] = useMemo(() => {
    if (results) return [{ id: 'results', items: results }];
    if (tab === 'nearby') return nearby ?? [];
    if (tab === 'following') return followed.length ? [{ id: 'following', items: followed }] : [];
    const g: Group[] = [];
    if (flying.desc.length) g.push({ id: 'desc', title: tr('sidebar.groups.descending'), items: flying.desc.slice(0, MAX_ROWS).map(item) });
    if (flying.glide.length) g.push({ id: 'glide', title: tr('sidebar.groups.gliding'), items: flying.glide.slice(0, MAX_ROWS).map(item) });
    if (flying.asc.length) g.push({ id: 'asc', title: tr('sidebar.groups.ascending'), items: flying.asc.slice(0, MAX_ROWS).map(item) });
    if (showGround && flying.ground.length) g.push({ id: 'ground', items: flying.ground.slice(0, MAX_ROWS).map(item) });
    return g;
  }, [results, tab, nearby, followed, flying, showGround, item, tr]);

  const navSerials = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.serial)), [groups]);

  useEffect(() => setActive(null), [query, tab]);
  useEffect(() => {
    if (active) document.getElementById(rowId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = navSerials.length;
      if (n === 0) return;
      const i = active ? navSerials.indexOf(active) : -1;
      setActive(navSerials[e.key === 'ArrowDown' ? Math.min(n - 1, i + 1) : Math.max(0, i - 1)]);
    } else if (e.key === 'Enter') {
      const target = active && navSerials.includes(active) ? active : navSerials[0];
      if (target) select(target, true);
    } else if (e.key === 'Escape') {
      if (active) setActive(null);
      else if (query) setQuery('');
      else e.currentTarget.blur();
    }
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!t.matches('[data-nav-row]')) return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-nav-row]'));
    const i = rows.indexOf(t);
    let j: number;
    if (e.key === 'ArrowDown') j = Math.min(rows.length - 1, i + 1);
    else if (e.key === 'ArrowUp') {
      if (i === 0) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      j = i - 1;
    } else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = rows.length - 1;
    else return;
    e.preventDefault();
    rows[j]?.focus();
  };

  const toggle = useCallback((serial: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(serial)) next.delete(serial);
      else next.add(serial);
      return next;
    });
  }, []);

  const filtered = typeFilter !== null || PHASES.some((p) => !phaseFilter[p]);
  const resetFilters = useCallback(() => {
    const st = useStore.getState();
    st.setTypeFilter(null);
    for (const p of PHASES) if (!st.phaseFilter[p]) st.togglePhase(p);
  }, []);

  const total = all.length;
  const flyingCount = flying.desc.length + flying.glide.length + flying.asc.length;
  const nearbyCount = nearby?.reduce((n, g) => n + g.items.length, 0);

  const renderGroup = (g: Group) => (
    <section key={g.id} aria-label={g.title}>
      {g.title && (
        <h2 className="flex items-baseline gap-2 px-5 pt-5 pb-1 text-[14px] font-semibold">
          {g.title}
          <span className="tabular text-faint font-sans text-[12.5px] font-normal">{g.items.length}</span>
        </h2>
      )}
      <ul>
        {g.items.map((it) => (
          <SondeItem key={it.serial} item={it} units={units} now={now} active={active === it.serial} expanded={open.has(it.serial)} onToggle={toggle} />
        ))}
      </ul>
    </section>
  );

  const skeleton = (n: number) => (
    <ul aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </ul>
  );

  let body: ReactNode;
  if (results) {
    body =
      results.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={tr('sidebar.search.emptyTitle')}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                {tr('sidebar.search.clear')}
              </Button>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  {tr('sidebar.filters.reset')}
                </Button>
              )}
            </>
          }
        >
          {tr('sidebar.search.emptyText')}
        </EmptyState>
      ) : (
        <>
          <p className="px-5 pt-4 text-[13px]">
            {tr('sidebar.search.results', { count: results.length, query: query.trim() })}
          </p>
          {groups.map(renderGroup)}
        </>
      );
  } else if (tab === 'nearby') {
    const widen = nextRadius(alerts.radiusKm);
    const editor = (
      <PointEditor
        onDone={() => setEditingPoint(false)}
        onCancel={() => setEditingPoint(false)}
        onUseGps={
          me?.kind === 'point'
            ? () => {
                setEditingPoint(false);
                onUseGps();
              }
            : undefined
        }
        onFocusInput={onFocusSearch}
        showCancel={!me}
      />
    );
    const choosePoint = (variant: 'default' | 'outline' | 'ghost') => (
      <Button variant={variant} size="sm" onClick={() => setEditingPoint(true)}>
        <MapPin />
        {tr('sidebar.nearby.choosePoint')}
      </Button>
    );
    body = !me ? (
      editingPoint ? (
        <div className="pt-2">
          <h2 className="px-5 pt-3 text-[16px] font-semibold">{tr('sidebar.nearby.choosePoint')}</h2>
          <p className="max-w-80 px-5 pt-1 text-[13.5px] leading-relaxed">{tr('sidebar.point.intro')}</p>
          {editor}
        </div>
      ) : geo === 'locating' ? (
        <div role="status" aria-live="polite">
          <p className="flex items-center gap-2 px-5 pt-5 text-[13px]">
            <LoaderCircle className="text-primary size-4 animate-spin" />
            {tr('sidebar.nearby.locating')}
          </p>
          <div className="px-5 pt-3">{choosePoint('outline')}</div>
          {skeleton(4)}
        </div>
      ) : (
        <EmptyState
          art="locate"
          title={geo === 'failed' ? tr('sidebar.nearby.unavailableTitle') : tr('sidebar.nearby.whereTitle')}
          actions={
            geo === 'failed' ? (
              <>
                {choosePoint('default')}
                <Button variant="outline" size="sm" onClick={onLocate}>
                  <RotateCw />
                  {tr('sidebar.nearby.retry')}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={onLocate}>
                  <LocateFixed />
                  {tr('sidebar.nearby.locate')}
                </Button>
                {choosePoint('outline')}
              </>
            )
          }
        >
          {geo === 'failed'
            ? tr('sidebar.nearby.unavailableText')
            : tr('sidebar.nearby.whereText')}
        </EmptyState>
      )
    ) : (
      <>
        <CentreBar centre={me} open={editingPoint} onToggle={() => setEditingPoint((v) => !v)} />
        {editingPoint && editor}
        <RadiusPicker units={units} className="px-5 pt-4" />
        <AlertPanel radiusKm={alerts.radiusKm} units={units} />
        {groups.length === 0 ? (
          loading && total === 0 ? (
            skeleton(4)
          ) : (
            <EmptyState
              art="locate"
              title={tr('sidebar.nearby.emptyTitle', { radius: fmtRadius(alerts.radiusKm, units) })}
              actions={
                <>
                  {widen !== undefined && (
                    <Button variant="outline" size="sm" onClick={() => setAlerts({ radiusKm: widen })}>
                      {tr('sidebar.nearby.widen', { radius: fmtRadius(widen, units) })}
                    </Button>
                  )}
                  {filtered && (
                    <Button variant="ghost" size="sm" onClick={resetFilters}>
                      {tr('sidebar.filters.reset')}
                    </Button>
                  )}
                </>
              }
            >
              {tr('sidebar.nearby.emptyText')}
            </EmptyState>
          )
        ) : (
          groups.map(renderGroup)
        )}
        <UpcomingLaunches className="mt-2 border-t" />
      </>
    );
  } else if (tab === 'history') {
    body = <HistoryPanel units={units} me={me} locating={geo === 'locating'} onLocate={onLocate} />;
  } else if (tab === 'following') {
    body =
      groups.length === 0 ? (
        <EmptyState
          icon={<Star />}
          title={tr('sidebar.following.emptyTitle')}
          actions={
            <Button variant="outline" size="sm" onClick={() => onTab('flying')}>
              {tr('sidebar.following.seeFlying')}
            </Button>
          }
        >
          {tr(isTouch() ? 'sidebar.following.emptyTouch' : 'sidebar.following.emptyClick')}{' '}
          {alerts.enabled ? tr('sidebar.following.alertsOn') : tr('sidebar.following.alertsOff')}
        </EmptyState>
      ) : (
        groups.map(renderGroup)
      );
  } else {
    body = (
      <>
        {showHint && total > 0 && (
          <div className="bg-surface mx-5 mt-5 rounded-lg border px-4 py-3">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed">
                {tr(isTouch() ? 'sidebar.flying.hintTouch' : 'sidebar.flying.hintClick')}
              </p>
              <button
                type="button"
                onClick={onDismissHint}
                aria-label={tr('sidebar.flying.dismissHint')}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -mt-1 -mr-2 grid size-7 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2"
              >
                <X className="size-4" />
              </button>
            </div>
            <FlightGuide className="mt-1 -ml-1.5" />
          </div>
        )}
        {loading && total === 0 ? (
          skeleton(6)
        ) : flyingCount === 0 ? (
          <EmptyState
            art="ascending"
            title={filtered ? tr('sidebar.flying.emptyFilteredTitle') : tr('sidebar.flying.emptyTitle')}
            actions={
              filtered && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  {tr('sidebar.filters.reset')}
                </Button>
              )
            }
          >
            {filtered
              ? tr('sidebar.flying.emptyFilteredText')
              : tr('sidebar.flying.emptyText')}
          </EmptyState>
        ) : (
          groups.filter((g) => g.id !== 'ground').map(renderGroup)
        )}
        {!loading && flyingCount === 0 && !filtered && <UpcomingLaunches className="border-t" />}
        {flying.ground.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showGround}
              onClick={() => setShowGround((v) => !v)}
              className="hover:bg-surface focus-visible:ring-ring/50 mt-4 flex w-full items-center gap-3 border-t border-b px-5 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <span className="min-w-0 flex-1">
                <span className="font-heading text-foreground flex items-baseline gap-2 text-[14px] font-semibold">
                  {tr('sidebar.flying.groundTitle')}
                  <span className="tabular text-faint font-sans text-[12.5px] font-normal">{flying.ground.length}</span>
                </span>
                <span className="block text-[12.5px]">{tr('sidebar.flying.groundText')}</span>
              </span>
              <ChevronDown className={cx('text-muted-foreground size-4 transition-transform', showGround && 'rotate-180')} />
            </button>
            {showGround && groups.filter((g) => g.id === 'ground').map(renderGroup)}
          </>
        )}
        {total > 0 && (
          <div className="px-5 pt-5">
            <FlightGuide className="-ml-1.5" />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className={cx('shrink-0 border-b px-5 pt-3 md:pt-5', results && 'pb-4')}>
        <div className="flex items-center gap-2">
          <Logo className="mr-1 size-8 shrink-0 md:size-9" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] leading-tight font-semibold whitespace-nowrap">SondeHub V2</h1>
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] leading-snug">
              <StatusPill />
              <span aria-hidden className="text-faint">
                ·
              </span>
              <span className="truncate">{tr('sidebar.header.subtitle')}</span>
            </p>
          </div>
          <LanguageSelect />
          <WhatsNew />
          <IconButton label={tr('sidebar.header.about')} side="bottom" className="-mr-2" onClick={onAbout}>
            <Info className="size-[18px]" />
          </IconButton>
        </div>

        <div data-tour="search" className="mt-3 flex items-center gap-2 md:mt-4">
          <div className="relative min-w-0 flex-1">
            <Search className="text-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={onFocusSearch}
              onBlur={() => setActive(null)}
              onKeyDown={onSearchKey}
              placeholder={tr('sidebar.search.placeholder')}
              aria-label={tr('sidebar.search.ariaLabel')}
              aria-controls="sonde-list"
              aria-activedescendant={active ? rowId(active) : undefined}
              className="bg-background text-foreground placeholder:text-faint h-9 rounded-md pr-9 pl-9 text-[14px] md:text-[14px] [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-md"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                aria-label={tr('sidebar.search.clear')}
              >
                <X className="size-4" />
              </Button>
            ) : (
              <Kbd className="bg-surface text-faint absolute top-1/2 right-2 hidden h-5 -translate-y-1/2 rounded-sm border px-1.5 text-[11px] md:inline-flex">/</Kbd>
            )}
          </div>
          <FiltersButton counts={counts} types={types} />
        </div>

        {!results && <TabBar tab={tab} onTab={onTab} counts={{ nearby: nearbyCount, flying: flyingCount, following: favourites.length, history: undefined }} />}
      </div>

      <ScrollArea data-vaul-no-drag={scrollLocked ? '' : undefined} className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div
          id="sonde-list"
          role="tabpanel"
          aria-label={
            results
              ? tr('sidebar.search.resultsLabel')
              : tab === 'nearby'
                ? tr('sidebar.tabs.nearby')
                : tab === 'following'
                  ? tr('sidebar.tabs.following')
                  : tab === 'history'
                    ? tr('sidebar.tabs.history')
                    : tr('sidebar.tabs.flying')
          }
          className="pb-8"
          onKeyDown={onListKey}
        >
          {error && <div className="border-destructive/30 text-destructive mx-5 mt-5 rounded-md border px-4 py-3 text-[13px]">{error}</div>}
          {body}
        </div>
      </ScrollArea>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  {
    id: 'nearby',
    get label() {
      return translate('sidebar.tabs.nearby');
    },
  },
  {
    id: 'flying',
    get label() {
      return translate('sidebar.tabs.flying');
    },
  },
  {
    id: 'following',
    get label() {
      return translate('sidebar.tabs.following');
    },
  },
  {
    id: 'history',
    get label() {
      return translate('sidebar.tabs.history');
    },
  },
];

function TabBar({ tab, onTab, counts }: { tab: Tab; onTab: (t: Tab) => void; counts: Record<Tab, number | undefined> }) {
  const tr = useT();
  return (
    <div
      role="tablist"
      data-tour="lists"
      aria-label={tr('sidebar.tabs.label')}
      className="mt-3 -mx-5 -mb-px flex gap-5 overflow-x-auto px-5 [scrollbar-width:none] md:mt-4 [&::-webkit-scrollbar]:hidden"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const i = TABS.findIndex((t) => t.id === tab);
        const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
        onTab(next);
        (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {TABS.map((t) => {
        const on = tab === t.id;
        const n = counts[t.id];
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={on}
            aria-controls="sonde-list"
            tabIndex={on ? 0 : -1}
            onClick={() => !on && onTab(t.id)}
            className={cx(
              'focus-visible:ring-ring/50 flex items-baseline gap-1.5 rounded-t-sm border-b-2 pt-1 pb-3 text-[14px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
              on ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t.label}
            {n !== undefined && n > 0 && <span className="tabular text-faint text-[12.5px] font-normal">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

function FiltersButton({ counts, types }: { counts: Record<FlightPhase, number>; types: [string, { count: number; maker?: string }][] }) {
  const phaseFilter = useStore((s) => s.phaseFilter);
  const typeFilter = useStore((s) => s.typeFilter);
  const duration = useStore((s) => s.settings.duration);
  const { togglePhase, setTypeFilter, setSettings } = useStore.getState();
  const tr = useT();
  const hidden = PHASES.filter((p) => !phaseFilter[p]).length + (typeFilter ? 1 : 0);
  const reset = () => {
    setTypeFilter(null);
    for (const p of PHASES) if (!useStore.getState().phaseFilter[p]) togglePhase(p);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cx('h-9 shrink-0 gap-1.5 px-3 text-[13.5px]', hidden > 0 && 'border-primary text-primary hover:text-primary')}>
          <SlidersHorizontal className="size-4" />
          {tr('sidebar.filters.title')}
          {hidden > 0 && <span className="tabular">({hidden})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-[320px] p-0" onEscapeKeyDown={keepSelection}>
        <div className="border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">{tr('sidebar.filters.title')}</h2>
          <p className="text-[12.5px]">{tr('sidebar.filters.subtitle')}</p>
        </div>
        <div className="space-y-5 px-4 py-4">
          <fieldset>
            <legend className="text-foreground mb-1 text-[13px] font-semibold">{tr('sidebar.filters.phases')}</legend>
            {PHASES.map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-3 py-1.5">
                <Icon3D id={p} size={30} className="-my-1" />
                <span className="text-foreground min-w-0 flex-1 text-[13.5px]">{PHASE_LABEL[p]}</span>
                <span className="tabular text-faint text-[12.5px]">{counts[p]}</span>
                <Switch checked={phaseFilter[p]} onCheckedChange={() => togglePhase(p)} aria-label={tr('sidebar.filters.showPhase', { phase: PHASE_LABEL[p].toLowerCase() })} />
              </label>
            ))}
          </fieldset>
          <div>
            <div className="text-foreground mb-2 text-[13px] font-semibold">{tr('sidebar.filters.type')}</div>
            <Select value={typeFilter ?? ALL_TYPES} onValueChange={(v) => setTypeFilter(v === ALL_TYPES ? null : v)}>
              <SelectTrigger aria-label={tr('sidebar.filters.type')} className="text-foreground h-9 w-full text-[13.5px]">
                <SelectValue>{typeFilter ?? tr('sidebar.filters.allTypes')}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-72">
                <SelectItem value={ALL_TYPES} className="text-[13.5px]">
                  {tr('sidebar.filters.allTypes')}
                </SelectItem>
                {typeFilter && !types.some(([k]) => k === typeFilter) && (
                  <SelectItem value={typeFilter} className="text-[13.5px]">
                    {typeFilter}
                  </SelectItem>
                )}
                {types.map(([k, t]) => (
                  <SelectItem key={k} value={k} className="text-[13.5px] *:[span]:last:flex-1">
                    {k}
                    <span className="text-muted-foreground ml-auto pl-3 text-[12px]">
                      {t.maker ? `${t.maker} · ` : ''}
                      <span className="tabular">{t.count}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-foreground text-[13px] font-semibold">{tr('sidebar.filters.history')}</div>
            <p className="mb-2 text-[12.5px]">{tr(HISTORY_KEY[duration])}</p>
            <Segmented<Duration>
              size="sm"
              value={duration}
              onChange={(d) => setSettings({ duration: d })}
              options={(Object.keys(DURATION_MS) as Duration[]).map((d) => ({ value: d, label: DURATION_LABEL[d] }))}
            />
          </div>
        </div>
        {hidden > 0 && (
          <div className="border-t px-4 py-3">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={reset}>
              {tr('sidebar.filters.reset')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AlertPanel({ radiusKm, units }: { radiusKm: number; units: Units }) {
  const alerts = useStore((s) => s.settings.alerts);
  const nFavs = useStore((s) => s.settings.favourites.length);
  const { setAlerts } = useStore.getState();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const tr = useT();

  if (!alerts.enabled) {
    return (
      <div className="mx-5 mt-4 flex items-center gap-3 rounded-lg border px-4 py-3">
        <Bell className="text-foreground size-5 shrink-0" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug">
          <span className="text-foreground block font-semibold">{tr('sidebar.alerts.ctaTitle')}</span>
          {tr('sidebar.alerts.ctaText', { radius: fmtRadius(radiusKm, units) })}
        </p>
        <Button
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await enableAlerts();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <LoaderCircle className="animate-spin" />}
          {tr('sidebar.alerts.enable')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-5 mt-4 rounded-lg border">
      <div className="flex items-center gap-3 px-4 py-3">
        <BellRing className="text-foreground size-5 shrink-0" />
        <p className="text-foreground min-w-0 flex-1 text-[13px] leading-snug">{tr('sidebar.alerts.enabled', { radius: fmtRadius(radiusKm, units) })}</p>
        <Button variant="outline" size="sm" className="shrink-0" aria-expanded={open} aria-controls="alert-settings" onClick={() => setOpen((v) => !v)}>
          {tr('sidebar.alerts.settings')}
          <ChevronDown className={cx('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>
      {open && (
        <div id="alert-settings" className="border-t px-2 pt-1 pb-2">
          <Toggle checked={alerts.landings} onChange={(v) => setAlerts({ landings: v })} label={tr('map.alerts.landings')} hint={tr('map.alerts.landingsHint')} />
          <Toggle
            checked={alerts.launchDetected}
            onChange={(v) => setAlerts({ launchDetected: v })}
            label={tr('map.alerts.launchDetected')}
            hint={tr('map.alerts.launchDetectedHint')}
          />
          <Toggle
            checked={alerts.launchPlanned}
            onChange={(v) => setAlerts({ launchPlanned: v })}
            label={tr('map.alerts.launchPlanned')}
            hint={tr('map.alerts.launchPlannedHint')}
          />
          <Toggle
            checked={alerts.favourites}
            onChange={(v) => setAlerts({ favourites: v })}
            label={tr('map.alerts.favourites')}
            hint={nFavs ? tr('map.alerts.favouritesHintCount', { count: nFavs }) : tr('map.alerts.favouritesHint')}
          />
          <div className="flex items-center justify-between gap-3 px-2 pt-2">
            <span className="text-faint text-[12px]">{tr('map.alerts.enableHint')}</span>
            <Button variant="ghost" size="sm" className="-mr-1 shrink-0" onClick={disableAlerts}>
              {tr('sidebar.alerts.disable')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FavButton({ serial }: { serial: string }) {
  const fav = useStore((st) => st.settings.favourites.includes(serial));
  const tr = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={fav}
          aria-label={fav ? tr('sidebar.fav.removeLabel', { serial }) : tr('sidebar.fav.addLabel', { serial })}
          onClick={() => {
            useStore.getState().toggleFavourite(serial);
            toast(fav ? tr('sidebar.fav.removed', { serial }) : tr('sidebar.fav.added', { serial }), { id: 'fav' });
          }}
          className={cx(
            'focus-visible:ring-ring/50 hover:bg-surface grid size-8 shrink-0 place-items-center rounded-md transition-[opacity,color,background-color] outline-none focus-visible:ring-2',
            fav
              ? 'text-foreground opacity-100'
              : 'text-faint hover:text-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          <Star className={cx('size-4', fav && 'fill-current')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{fav ? tr('sidebar.fav.remove') : tr('sidebar.fav.add')}</TooltipContent>
    </Tooltip>
  );
}

function TechToggle({ id, expanded, onClick }: { id: string; expanded: boolean; onClick: () => void }) {
  const tr = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={tr('sidebar.tech.title')}
          onClick={onClick}
          className={cx(
            'focus-visible:ring-ring/50 hover:bg-surface grid size-8 shrink-0 place-items-center rounded-md transition-colors outline-none focus-visible:ring-2',
            expanded ? 'text-foreground' : 'text-faint hover:text-foreground',
          )}
        >
          <ChevronDown className={cx('size-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{expanded ? tr('sidebar.tech.hide') : tr('sidebar.tech.show')}</TooltipContent>
    </Tooltip>
  );
}

function SondeItem({
  item,
  units,
  now,
  active,
  expanded,
  onToggle,
}: {
  item: Item;
  units: Units;
  now: number;
  active: boolean;
  expanded: boolean;
  onToggle: (serial: string) => void;
}) {
  const { serial, sonde: s } = item;
  const hovered = useStore((st) => st.hovered === serial);
  const { select, setHovered } = useStore.getState();
  useT();
  const techId = `tech-${serial}`;
  return (
    <li
      className={cx('group/row border-b transition-colors last:border-b-0', (hovered || active) && 'bg-surface', active && 'shadow-[inset_2px_0_0_var(--primary)]')}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(serial)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(null)}
    >
      <div className="flex items-stretch pr-3">
        <button
          type="button"
          id={rowId(serial)}
          data-testid={s ? 'sonde-row' : 'sonde-row-placeholder'}
          data-nav-row
          onClick={() => select(serial, true)}
          className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-start gap-3 py-3 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span className="-my-1 -ml-1.5 grid size-10 shrink-0 place-items-center" title={s ? PHASE_LABEL[s.phase] : undefined}>
            {s ? <SondeIcon3D sonde={s} size={40} /> : <Star className="text-faint size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="tabular text-foreground block truncate text-[14.5px] leading-5 font-semibold">{serial}</span>
            <span className={cx('mt-0.5 block text-[13px] leading-snug', item.strong && 'text-foreground')}>{item.status}</span>
            {item.metrics && (
              <span className="mt-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-2">
                {item.metrics.map((m) => (
                  <span key={m.label} className="min-w-0">
                    <span className="text-faint block truncate text-[12px] leading-4">{m.label}</span>
                    <span className="tabular text-foreground mt-0.5 block truncate text-[14px] leading-5 font-semibold">{m.value}</span>
                  </span>
                ))}
              </span>
            )}
          </span>
        </button>
        <span className="flex shrink-0 flex-col items-center justify-between pt-1.5 pb-2">
          <FavButton serial={serial} />
          {s && <TechToggle id={techId} expanded={expanded} onClick={() => onToggle(serial)} />}
        </span>
      </div>
      {s && expanded && <TechList id={techId} sonde={s} units={units} now={now} />}
    </li>
  );
}

function TechList({ id, sonde: s, units, now }: { id: string; sonde: Sonde; units: Units; now: number }) {
  const f = s.last;
  const receivers = Object.values(s.receivers);
  const snrs = receivers.map((r) => r.snr).filter((v): v is number => v !== undefined);
  const tr = useT();
  const hSpeed = fmtHSpeed(f.vel_h, units);
  const frameTime = { time: fmtClock(s.lastTime), ago: ago(s.lastTime, now) };
  const rows: [string, string][] = [
    [tr('sidebar.tech.model'), `${s.subtype ?? s.type ?? '—'}${s.manufacturer ? ` (${s.manufacturer})` : ''}`],
    [tr('sidebar.tech.frequency'), fmtFreq(f.frequency)],
    [
      tr('sidebar.tech.hSpeed'),
      f.heading !== undefined ? tr('sidebar.tech.speedHeading', { speed: hSpeed, direction: compass(f.heading), degrees: Math.round(f.heading) }) : hSpeed,
    ],
    [tr('sidebar.tech.temperature'), fmtTemp(f.temp, units)],
    [
      tr('sidebar.tech.lastFrame'),
      f.frame !== undefined ? tr('sidebar.tech.lastFrameNumber', { ...frameTime, frame: f.frame }) : tr('sidebar.tech.lastFrameValue', frameTime),
    ],
    [
      tr('sidebar.tech.reception'),
      snrs.length
        ? tr('sidebar.tech.receiversSnr', { count: receivers.length, snr: Math.round(Math.max(...snrs)) })
        : tr('sidebar.tech.receivers', { count: receivers.length }),
    ],
    [tr('sidebar.tech.position'), fmtCoord(f.lat, f.lon)],
  ];
  return (
    <div id={id} className="bg-surface mx-5 mb-4 rounded-md border px-4 py-3 text-[12.5px]">
      <p className="text-foreground mb-2 font-semibold">{tr('sidebar.tech.title')}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="whitespace-nowrap">{k}</dt>
            <dd className="tabular text-foreground min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
