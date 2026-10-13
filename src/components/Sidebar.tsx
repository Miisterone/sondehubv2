import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import {
  ArrowDownUp,
  Bell,
  BellRing,
  Command,
  Info,
  LoaderCircle,
  MapPin,
  MapPinOff,
  MousePointerClick,
  Navigation2,
  Radar,
  RotateCw,
  Search,
  SearchX,
  Star,
  X,
} from 'lucide-react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { toast } from 'sonner';
import type { MapMouseEvent } from 'maplibre-gl';
import { DURATION_MS, useStore, type Duration, type SortKey } from '@/store/useStore';
import type { FlightPhase, Sonde } from '@/lib/types';
import { makeVisible, usefulPrediction } from '@/lib/filter';
import { ago, fmtAltShort, fmtDist, fmtVSpeed, relative, type Units, fmtRadius } from '@/lib/format';
import { PALETTE_SHORTCUT } from '@/lib/platform';
import { bearing, compass, distance } from '@/lib/geo';
import { locateUser } from '@/lib/geolocation';
import { enableAlerts } from '@/lib/alerts';
import { PHASE_COLOUR, PHASE_LABEL } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerDescription, DrawerPortal, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle as ToggleButton } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconButton, Logo, MapIcon, Segmented, Sparkline, cx } from './ui';
import { SondeDetail } from './SondeDetail';
import { StatusPill } from './StatusPill';
import { getMap } from './MapView';

const PHASES: FlightPhase[] = ['ascending', 'descending', 'landed', 'lost'];
const ALL_PHASES: Record<FlightPhase, boolean> = { ascending: true, descending: true, landed: true, lost: true };

/** Mobile bottom-sheet snap points, as a fraction of the viewport height (peek / half / full). */
const SNAPS: number[] = [0.24, 0.55, 0.9];
const [PEEK, HALF, FULL] = SNAPS;

/** Map layers whose features react to a tap (anything else is "empty map"). */
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
];

/** Rows rendered in the "Toutes" list (the rest is reachable through the search). */
const MAX_ROWS = 400;
const RADII = [25, 50, 100, 200] as const;

/** Event dispatched (command palette, welcome card…) to open the "Près de moi" list. */
export const NEARBY_EVENT = 'sondetrack:nearby';

type ListMode = 'all' | 'nearby';
type GeoState = 'idle' | 'locating' | 'failed';

const HINT_KEY = 'sondetrack.listHint.v1';
const readHintSeen = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};
const writeHintSeen = () => {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* storage unavailable: the hint simply comes back next time */
  }
};

export function Sidebar({ onAbout }: { onAbout: () => void }) {
  const selected = useStore((s) => s.selected);
  const isMobile = useIsMobile();
  const [snap, setSnap] = useState(PEEK);
  const [mode, setMode] = useState<ListMode>('all');
  const [geo, setGeo] = useState<GeoState>('idle');
  const [hintSeen, setHintSeen] = useState(readHintSeen);

  // On mobile, opening a sonde expands the sheet enough to read it.
  useEffect(() => {
    if (isMobile && selected) setSnap((s) => (s === PEEK ? HALF : s));
  }, [selected, isMobile]);

  // The first-use hint goes away for good once a sonde has been opened.
  useEffect(() => {
    if (selected && !hintSeen) {
      setHintSeen(true);
      writeHintSeen();
    }
  }, [selected, hintSeen]);

  const startNearby = useCallback(() => {
    setMode('nearby');
    if (useStore.getState().userLocation) return;
    setGeo('locating');
    void locateUser({ fly: false }).then((ok) => setGeo(ok ? 'idle' : 'failed'));
  }, []);

  // Other parts of the app (command palette, welcome card) can open "Près de moi".
  useEffect(() => {
    const on = () => {
      useStore.getState().select(null);
      startNearby();
      setSnap((s) => (s === PEEK ? HALF : s));
    };
    window.addEventListener(NEARBY_EVENT, on);
    return () => window.removeEventListener(NEARBY_EVENT, on);
  }, [startNearby]);

  // Mobile: tapping an empty spot of the map tucks the sheet away.
  useEffect(() => {
    if (!isMobile) return;
    let attached: ReturnType<typeof getMap>;
    const onClick = (e: MapMouseEvent) => {
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
  ) : (
    <SondeList
      onAbout={onAbout}
      onFocusSearch={() => isMobile && setSnap(FULL)}
      scrollLocked={isMobile && snap !== FULL}
      mode={mode}
      onMode={(m) => (m === 'nearby' ? startNearby() : setMode('all'))}
      geo={geo}
      onRetryGeo={startNearby}
      showHint={!hintSeen}
      onDismissHint={() => {
        setHintSeen(true);
        writeHintSeen();
      }}
    />
  );

  if (!isMobile) {
    return (
      <aside className="glass pointer-events-auto absolute top-3 bottom-3 left-3 z-20 flex w-[380px] flex-col overflow-hidden rounded-2xl">
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

/**
 * Persistent, non-modal bottom sheet (shadcn Drawer / vaul) with three snap points.
 * No overlay and pointer events pass through to the map above it.
 *
 * vaul translates a full-height drawer to show `snap × 100%` of it; the inner frame is sized to
 * the same fraction so the visible part always ends at the bottom of the screen and its own
 * scroll areas stay reachable.
 */
function BottomSheet({ snap, onSnapChange, children }: { snap: number; onSnapChange: (s: number) => void; children: ReactNode }) {
  const dragged = useRef(false);
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
          className="glass glass-strong pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex h-full flex-col rounded-t-3xl outline-none"
        >
          <DrawerTitle className="sr-only">Radiosondes</DrawerTitle>
          <DrawerDescription className="sr-only">Liste des radiosondes et détail de la sonde sélectionnée</DrawerDescription>
          <div
            className="flex min-h-0 flex-col transition-[height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ height: `${snap * 100}%` }}
          >
            <button
              type="button"
              aria-label={snap === FULL ? 'Réduire le panneau' : 'Agrandir le panneau'}
              onPointerDown={() => (dragged.current = false)}
              onClick={cycle}
              className="flex h-5 w-full shrink-0 cursor-grab items-end justify-center outline-none"
            >
              <span className="bg-muted-foreground/35 h-1.5 w-10 rounded-full" />
            </button>
            <div className="min-h-0 flex-1">{children}</div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}

/**
 * vaul 1.1 does not forward `modal={false}` to Radix Dialog, whose modal content then marks every
 * other element `aria-hidden` (map controls included) for as long as the always-open sheet exists.
 * Undo those markers, except while a real modal dialog (command palette, À propos) is open.
 */
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

const openCommandPalette = () => window.dispatchEvent(new Event('sondetrack:command'));
const rowId = (serial: string) => `sonde-row-${serial}`;
const isTouch = () => window.matchMedia('(hover: none)').matches;

/** What "Près de moi" knows about a sonde. */
interface NearbyInfo {
  /** Distance to the current position, metres. */
  distM: number;
  /** Predicted landing, when meaningful (see `usefulPrediction`). */
  landing?: { distM: number; time: number };
  /** Bearing from the user to the landing point (or to the sonde without prediction). */
  bearing: number;
  /** Closest of the two distances: sort key and radius test. */
  best: number;
}

interface ListProps {
  onAbout: () => void;
  onFocusSearch: () => void;
  scrollLocked: boolean;
  mode: ListMode;
  onMode: (m: ListMode) => void;
  geo: GeoState;
  onRetryGeo: () => void;
  showHint: boolean;
  onDismissHint: () => void;
}

function SondeList({ onAbout, onFocusSearch, scrollLocked, mode, onMode, geo, onRetryGeo, showHint, onDismissHint }: ListProps) {
  const sondes = useStore((s) => s.sondes);
  const predictions = useStore((s) => s.predictions);
  const query = useStore((s) => s.query);
  const phaseFilter = useStore((s) => s.phaseFilter);
  const sort = useStore((s) => s.sort);
  const duration = useStore((s) => s.settings.duration);
  const units = useStore((s) => s.settings.units);
  const favourites = useStore((s) => s.settings.favourites);
  const alerts = useStore((s) => s.settings.alerts);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const me = useStore((s) => s.userLocation);
  const now = useStore((s) => s.now);
  const { setQuery, togglePhase, setSort, setSettings, setAlerts, select } = useStore.getState();
  const searchRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // "/" focuses the search field from anywhere but another text field.
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

  const counts = useMemo(() => {
    const c: Record<FlightPhase, number> = { ascending: 0, descending: 0, landed: 0, lost: 0 };
    for (const s of Object.values(sondes)) c[s.phase]++;
    return c;
  }, [sondes]);

  const visible = useMemo(() => makeVisible(query, phaseFilter), [query, phaseFilter]);

  // Followed sondes: pinned on top whatever the phase filters, but still searchable.
  const favRows = useMemo(() => {
    const matches = makeVisible(query, ALL_PHASES);
    const q = query.trim().toLowerCase();
    return favourites.flatMap((serial): { serial: string; sonde?: Sonde }[] => {
      const s = sondes[serial];
      if (s) return matches(s) ? [{ serial, sonde: s }] : [];
      return !q || serial.toLowerCase().includes(q) ? [{ serial }] : [];
    });
  }, [favourites, sondes, query]);

  const list = useMemo(() => {
    if (mode !== 'all') return [];
    const favSet = new Set(favourites);
    const arr = Object.values(sondes).filter((s) => !favSet.has(s.serial) && visible(s));
    const cmp: Record<SortKey, (a: Sonde, b: Sonde) => number> = {
      recent: (a, b) => b.lastTime - a.lastTime,
      altitude: (a, b) => b.last.alt - a.last.alt,
      serial: (a, b) => a.serial.localeCompare(b.serial),
      distance: me
        ? (a, b) => distance(me.lat, me.lon, a.last.lat, a.last.lon) - distance(me.lat, me.lon, b.last.lat, b.last.lon)
        : (a, b) => b.lastTime - a.lastTime,
    };
    return arr.sort(cmp[sort]);
  }, [mode, sondes, favourites, visible, sort, me]);

  const nearby = useMemo(() => {
    if (mode !== 'nearby' || !me) return [];
    const radiusM = alerts.radiusKm * 1000;
    const out: { sonde: Sonde; info: NearbyInfo }[] = [];
    for (const s of Object.values(sondes)) {
      if (!visible(s)) continue;
      const distM = distance(me.lat, me.lon, s.last.lat, s.last.lon);
      const p = predictions[s.serial];
      const l = usefulPrediction(s, p) ? p.landing : null;
      const landing = l ? { distM: distance(me.lat, me.lon, l.lat, l.lon), time: l.time * 1000 } : undefined;
      const best = Math.min(distM, landing?.distM ?? Infinity);
      if (best > radiusM) continue;
      const target = l ?? s.last;
      out.push({ sonde: s, info: { distM, landing, best, bearing: bearing(me.lat, me.lon, target.lat, target.lon) } });
    }
    return out.sort((a, b) => a.info.best - b.info.best);
  }, [mode, me, sondes, predictions, visible, alerts.radiusKm]);

  /** Rows reachable with ↑/↓, in display order. */
  const navSerials = useMemo(
    () => (mode === 'nearby' ? nearby.map((n) => n.sonde.serial) : [...favRows.map((f) => f.serial), ...list.slice(0, MAX_ROWS).map((s) => s.serial)]),
    [mode, nearby, favRows, list],
  );

  useEffect(() => setActive(null), [query, mode]);
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
      else e.currentTarget.blur();
    }
  };

  // ↑/↓/Home/End move focus between rows once a row has the focus.
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

  const total = Object.keys(sondes).length;
  const shown = list.length + favRows.filter((f) => f.sonde).length;
  const filtered = query !== '' || PHASES.some((p) => !phaseFilter[p]);
  const resetFilters = useCallback(() => {
    const st = useStore.getState();
    st.setQuery('');
    for (const p of PHASES) if (!st.phaseFilter[p]) st.togglePhase(p);
  }, []);

  const rowsAll = (
    <>
      {showHint && !query && total > 0 && (
        <div className="text-muted-foreground animate-in flex items-start gap-2 px-2.5 pt-1.5 pb-1 text-[11.5px] leading-snug">
          <MousePointerClick className="text-primary mt-px size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{isTouch() ? 'Touchez' : 'Cliquez sur'} une sonde pour voir sa trajectoire et son point d'atterrissage.</span>
          <button
            type="button"
            onClick={onDismissHint}
            aria-label="Masquer l'astuce"
            className="hover:text-foreground focus-visible:ring-ring/50 -mt-0.5 -mr-1 grid size-5 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      {favRows.length > 0 && (
        <>
          <SectionLabel icon={<Star className="size-3 fill-current text-amber-500 dark:text-amber-400" />} count={favRows.length}>
            Suivies
          </SectionLabel>
          {favRows.map((f) =>
            f.sonde ? (
              <SondeRow
                key={f.serial}
                sonde={f.sonde}
                units={units}
                now={now}
                active={active === f.serial}
                distanceM={me ? distance(me.lat, me.lon, f.sonde.last.lat, f.sonde.last.lon) : undefined}
              />
            ) : (
              <FavPlaceholderRow key={f.serial} serial={f.serial} active={active === f.serial} />
            ),
          )}
          {list.length > 0 && <SectionLabel>Toutes les sondes</SectionLabel>}
        </>
      )}
      {loading && total === 0 && favRows.length === 0 ? (
        Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
      ) : list.length === 0 ? (
        <EmptyState filtered={filtered && total > 0} onReset={resetFilters} compact={favRows.length > 0} />
      ) : (
        list
          .slice(0, MAX_ROWS)
          .map((s) => (
            <SondeRow
              key={s.serial}
              sonde={s}
              units={units}
              now={now}
              active={active === s.serial}
              distanceM={me ? distance(me.lat, me.lon, s.last.lat, s.last.lon) : undefined}
            />
          ))
      )}
    </>
  );

  const rowsNearby = !me ? (
    geo === 'locating' ? (
      <LocatingState />
    ) : (
      <GeoFailedState failed={geo === 'failed'} onRetry={onRetryGeo} onBack={() => onMode('all')} />
    )
  ) : (
    <>
      <AlertCta enabled={alerts.enabled} radiusKm={alerts.radiusKm} />
      {nearby.length === 0 ? (
        loading && total === 0 ? (
          Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)
        ) : (
          <NearbyEmpty
            radiusKm={alerts.radiusKm}
            filtered={filtered}
            onWiden={() => setAlerts({ radiusKm: RADII.find((r) => r > alerts.radiusKm) ?? 200 })}
            onReset={resetFilters}
          />
        )
      ) : (
        nearby.map(({ sonde, info }) => <SondeRow key={sonde.serial} sonde={sonde} units={units} now={now} active={active === sonde.serial} near={info} />)
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <Logo className="size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] leading-tight font-bold tracking-tight">SondeTrack</h1>
            <p className="text-muted-foreground text-[11px] leading-tight">Radiosondes en temps réel</p>
          </div>
          <StatusPill />
          <IconButton label="À propos" side="bottom" className="-mr-1.5 size-8" onClick={onAbout}>
            <Info className="size-[17px]" />
          </IconButton>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={onFocusSearch}
              onBlur={() => setActive(null)}
              onKeyDown={onSearchKey}
              placeholder="Numéro de série, type, récepteur…"
              aria-label="Rechercher une sonde"
              aria-controls="sonde-list"
              aria-activedescendant={active ? rowId(active) : undefined}
              className="bg-muted/60 dark:bg-muted/50 h-8 rounded-xl border-transparent pr-9 pl-8 text-[13px] shadow-none md:text-[13px] [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 size-6 -translate-y-1/2 rounded-lg"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                aria-label="Effacer la recherche"
              >
                <X className="size-3.5" />
              </Button>
            ) : (
              <Kbd className="bg-background/70 absolute top-1/2 right-2 hidden h-[18px] -translate-y-1/2 border font-mono text-[10px] md:inline-flex">/</Kbd>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={openCommandPalette}
                aria-label="Ouvrir la palette de commandes"
                className="bg-muted/60 dark:bg-muted/50 text-muted-foreground hover:text-foreground h-8 shrink-0 gap-1 rounded-xl px-2"
              >
                <Command className="size-3.5 md:hidden" />
                <Kbd className="text-muted-foreground hidden h-[18px] bg-transparent px-0.5 font-mono text-[11px] md:inline-flex">{PALETTE_SHORTCUT}</Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Palette de commandes</TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Filtrer par phase de vol">
          {PHASES.map((p) => (
            <Tooltip key={p}>
              <TooltipTrigger asChild>
                <ToggleButton
                  pressed={phaseFilter[p]}
                  onPressedChange={() => togglePhase(p)}
                  aria-label={`${PHASE_LABEL[p]} : ${counts[p]}`}
                  className={cx(
                    'h-auto min-w-0 flex-col items-stretch gap-0 rounded-xl border border-transparent px-2 py-1.5 text-left font-normal transition-all',
                    // aria-pressed, not data-state: the tooltip trigger overrides data-state on the same element.
                    'hover:bg-muted/60 hover:text-foreground opacity-45 grayscale hover:opacity-80',
                    'aria-pressed:bg-muted/60 dark:aria-pressed:bg-muted/50 aria-pressed:border-border/50 aria-pressed:text-foreground aria-pressed:opacity-100 aria-pressed:grayscale-0',
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="tabular font-mono text-[17px] leading-tight font-bold" style={{ color: PHASE_COLOUR[p] }}>
                      {counts[p]}
                    </span>
                    <MapIcon id={`sonde-${p}`} size={17} />
                  </span>
                  <span className="text-muted-foreground truncate text-[10.5px] leading-tight">{PHASE_LABEL[p]}</span>
                </ToggleButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {phaseFilter[p] ? 'Masquer' : 'Afficher'} : {PHASE_LABEL[p].toLowerCase()}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Segmented<Duration>
            size="sm"
            value={duration}
            onChange={(d) => setSettings({ duration: d })}
            options={(Object.keys(DURATION_MS) as Duration[]).map((d) => ({
              value: d,
              label: d.replace('d', 'j'),
              title: `Historique : ${d.replace('d', ' jour').replace('h', ' h')}`,
            }))}
          />
          {mode === 'nearby' ? (
            <span className="text-muted-foreground flex h-7 items-center gap-1.5 px-2 text-[11.5px]">
              <ArrowDownUp className="size-3.5" />
              Par proximité
            </span>
          ) : (
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger
                size="sm"
                aria-label="Trier"
                className="bg-muted/60 dark:bg-muted/50 dark:hover:bg-muted text-muted-foreground hover:text-foreground h-7! gap-1.5 rounded-lg border-transparent px-2 text-[11.5px] shadow-none [&_svg:not([class*='size-'])]:size-3.5"
              >
                <ArrowDownUp />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="min-w-40 rounded-xl">
                <SelectItem value="recent" className="text-[12.5px]">
                  Plus récentes
                </SelectItem>
                <SelectItem value="altitude" className="text-[12.5px]">
                  Altitude
                </SelectItem>
                <SelectItem value="serial" className="text-[12.5px]">
                  N° de série
                </SelectItem>
                <SelectItem value="distance" disabled={!me} className="text-[12.5px]">
                  Distance
                  {!me && <span className="text-muted-foreground ml-auto text-[11px]">GPS requis</span>}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="text-muted-foreground flex min-h-9 items-center justify-between gap-2 border-t px-3 py-1 text-[11px]">
        <ModeTabs mode={mode} onMode={onMode} nearbyCount={me && mode === 'nearby' ? nearby.length : undefined} />
        {mode === 'nearby' ? (
          me && (
            <div role="group" aria-label="Rayon autour de vous" className="flex items-center gap-1">
              <Segmented<string>
                size="sm"
                value={String(alerts.radiusKm)}
                onChange={(v) => setAlerts({ radiusKm: Number(v) })}
                className="[&>button]:px-1.5"
                options={RADII.map((r) => ({ value: String(r), label: fmtRadius(r, units).split(' ')[0], title: `Dans un rayon de ${fmtRadius(r, units)}` }))}
              />
              <span>km</span>
            </div>
          )
        ) : (
          <span className="flex items-center gap-2">
            {loading && <span className="bg-primary size-1.5 animate-pulse rounded-full" aria-label="Chargement…" />}
            <span>
              <span className="tabular text-foreground font-mono font-medium">{shown}</span> / <span className="tabular font-mono">{total}</span> sondes
            </span>
          </span>
        )}
      </div>

      <ScrollArea
        data-vaul-no-drag={scrollLocked ? '' : undefined}
        className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!"
      >
        <div id="sonde-list" role="tabpanel" aria-label={mode === 'nearby' ? 'Sondes près de moi' : 'Toutes les sondes'} className="px-2 pt-1 pb-2" onKeyDown={onListKey}>
          {error && <div className="bg-destructive/10 text-destructive m-2 rounded-xl p-3 text-xs">{error}</div>}
          {mode === 'nearby' ? rowsNearby : rowsAll}
        </div>
      </ScrollArea>
    </div>
  );
}

function ModeTabs({ mode, onMode, nearbyCount }: { mode: ListMode; onMode: (m: ListMode) => void; nearbyCount?: number }) {
  const tabs: { id: ListMode; label: ReactNode }[] = [
    { id: 'all', label: 'Toutes' },
    {
      id: 'nearby',
      label: (
        <>
          <MapPin className="size-3.5" />
          Près de moi
          {nearbyCount !== undefined && <span className="tabular bg-primary/15 text-primary rounded-full px-1.5 text-[10px] font-semibold leading-4">{nearbyCount}</span>}
        </>
      ),
    },
  ];
  return (
    <div
      role="tablist"
      aria-label="Liste des sondes"
      className="flex items-center gap-0.5"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const next: ListMode = mode === 'all' ? 'nearby' : 'all';
        onMode(next);
        (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={mode === t.id}
          aria-controls="sonde-list"
          tabIndex={mode === t.id ? 0 : -1}
          onClick={() => mode !== t.id && onMode(t.id)}
          className={cx(
            'focus-visible:ring-ring/50 flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
            mode === t.id ? 'bg-background text-foreground ring-border/70 dark:bg-muted/80 shadow-xs ring-1 dark:ring-0' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function SectionLabel({ children, icon, count }: { children: ReactNode; icon?: ReactNode; count?: number }) {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider uppercase">
      {icon}
      {children}
      {count !== undefined && <span className="tabular font-mono font-normal opacity-70">{count}</span>}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2.5 py-2">
      <Skeleton className="bg-foreground/10 size-9 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="bg-foreground/10 h-3.5 w-32 rounded-md" />
        <Skeleton className="bg-foreground/10 h-3 w-44 rounded-md" />
      </div>
      <Skeleton className="bg-foreground/10 h-5 w-14 rounded-md" />
    </div>
  );
}

function StateBlock({ icon, title, children, actions, compact }: { icon: ReactNode; title: string; children?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center px-6 text-center', compact ? 'py-5' : 'py-10')}>
      <span className="bg-muted/70 text-muted-foreground mb-3 grid size-10 place-items-center rounded-xl [&>svg]:size-5">{icon}</span>
      <p className="text-[13px] font-medium">{title}</p>
      {children && <p className="text-muted-foreground mt-0.5 max-w-72 text-[12px] leading-snug">{children}</p>}
      {actions && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

function EmptyState({ filtered, onReset, compact }: { filtered: boolean; onReset: () => void; compact?: boolean }) {
  return (
    <StateBlock
      compact={compact}
      icon={filtered ? <SearchX /> : <Radar />}
      title={filtered ? 'Aucun résultat' : 'Aucune sonde'}
      actions={
        filtered && (
          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[12px]" onClick={onReset}>
            Réinitialiser les filtres
          </Button>
        )
      }
    >
      {filtered ? 'Aucune sonde ne correspond à la recherche.' : 'Aucune sonde sur la période.'}
    </StateBlock>
  );
}

function LocatingState() {
  return (
    <div role="status" aria-live="polite">
      <div className="text-muted-foreground flex items-center gap-2 px-2.5 pt-2 pb-1 text-[12px]">
        <LoaderCircle className="text-primary size-3.5 animate-spin" />
        Recherche de votre position…
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}

function GeoFailedState({ failed, onRetry, onBack }: { failed: boolean; onRetry: () => void; onBack: () => void }) {
  return (
    <StateBlock
      icon={<MapPinOff />}
      title={failed ? 'Position indisponible' : 'Où êtes-vous ?'}
      actions={
        <>
          <Button size="sm" className="h-7 gap-1.5 rounded-lg text-[12px]" onClick={onRetry}>
            {failed ? <RotateCw className="size-3.5" /> : <MapPin className="size-3.5" />}
            {failed ? 'Réessayer' : 'Me localiser'}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground h-7 rounded-lg text-[12px]" onClick={onBack}>
            Voir toutes les sondes
          </Button>
        </>
      }
    >
      {failed
        ? "Autorisez l'accès à votre position dans le navigateur pour voir les sondes qui passent ou vont atterrir autour de vous."
        : 'Votre position sert uniquement à trouver les sondes qui passent ou vont atterrir autour de vous.'}
    </StateBlock>
  );
}

function NearbyEmpty({ radiusKm, filtered, onWiden, onReset }: { radiusKm: number; filtered: boolean; onWiden: () => void; onReset: () => void }) {
  const units = useStore((s) => s.settings.units);
  return (
    <StateBlock
      icon={<Radar />}
      title={`Aucune sonde à moins de ${fmtRadius(radiusKm, units)}`}
      actions={
        <>
          {radiusKm < RADII[RADII.length - 1] && (
            <Button variant="outline" size="sm" className="h-7 rounded-lg text-[12px]" onClick={onWiden}>
              Élargir à {fmtRadius(RADII.find((r) => r > radiusKm) ?? 200, units)}
            </Button>
          )}
          {filtered && (
            <Button variant="ghost" size="sm" className="text-muted-foreground h-7 rounded-lg text-[12px]" onClick={onReset}>
              Réinitialiser les filtres
            </Button>
          )}
        </>
      }
    >
      Les sondes en vol au-dessus de vous ou dont l'atterrissage est prévu dans ce rayon apparaîtront ici.
    </StateBlock>
  );
}

function AlertCta({ enabled, radiusKm }: { enabled: boolean; radiusKm: number }) {
  const units = useStore((s) => s.settings.units);
  const [busy, setBusy] = useState(false);
  if (enabled) {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-[11.5px]">
        <BellRing className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-foreground/80 font-medium">Alertes actives ✓</span>
        <span className="truncate">· atterrissages à moins de {fmtRadius(radiusKm, units)}</span>
      </div>
    );
  }
  return (
    <div className="bg-primary/8 border-primary/20 mx-0.5 mt-1 mb-1.5 flex items-center gap-3 rounded-xl border px-3 py-2.5">
      <span className="bg-primary/15 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
        <Bell className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-[12px] leading-snug font-medium">
        Être alerté quand une sonde atterrit près de moi
        <span className="text-muted-foreground block text-[11px] font-normal">À moins de {fmtRadius(radiusKm, units)} de votre position</span>
      </p>
      <Button
        size="sm"
        className="h-7 shrink-0 gap-1.5 rounded-lg px-2.5 text-[12px]"
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
        {busy && <LoaderCircle className="size-3.5 animate-spin" />}
        Activer
      </Button>
    </div>
  );
}

/** Star toggle, a sibling of the row button (never nested in it). */
function FavButton({ serial }: { serial: string }) {
  const fav = useStore((st) => st.settings.favourites.includes(serial));
  const label = fav ? 'Ne plus suivre' : 'Suivre cette sonde';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={fav}
          aria-label={`Suivre ${serial}`}
          onClick={() => {
            useStore.getState().toggleFavourite(serial);
            toast(fav ? `${serial} n'est plus suivie` : `${serial} ajoutée aux sondes suivies`, {
              id: 'fav',
              description: fav ? undefined : 'Elle reste épinglée en haut de la liste.',
            });
          }}
          className={cx(
            'focus-visible:ring-ring/50 hover:bg-muted mr-1 grid size-7 shrink-0 place-items-center rounded-lg transition-[opacity,color,background-color] outline-none focus-visible:ring-2',
            fav
              ? 'text-amber-500 opacity-100 dark:text-amber-400'
              : 'text-muted-foreground hover:text-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-50',
          )}
        >
          <Star className={cx('size-4', fav && 'fill-current')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

const ROW_BUTTON =
  'focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pr-1 pl-2.5 text-left outline-none focus-visible:ring-2';

function rowWrapper(highlighted: boolean, active: boolean) {
  return cx(
    'hover-row group/row flex items-center rounded-xl transition-colors',
    highlighted && 'bg-[var(--panel-hover)]',
    active && 'ring-primary/45 ring-1 ring-inset',
  );
}

function FavPlaceholderRow({ serial, active }: { serial: string; active: boolean }) {
  return (
    <div className={rowWrapper(active, active)}>
      <button
        type="button"
        id={rowId(serial)}
        data-testid="sonde-row-placeholder"
        data-nav-row
        onClick={() => useStore.getState().select(serial, true)}
        className={ROW_BUTTON}
      >
        <span className="bg-muted/70 text-muted-foreground grid size-9 shrink-0 place-items-center rounded-xl">
          <Star className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[13px] font-semibold">{serial}</span>
          <span className="text-muted-foreground block truncate text-[11.5px]">Aucune donnée sur la période affichée</span>
        </span>
      </button>
      <FavButton serial={serial} />
    </div>
  );
}

function nearbyLine(s: Sonde, n: NearbyInfo, units: Units, now: number): string {
  if (n.landing) {
    const where = fmtDist(n.landing.distM, units);
    return n.landing.time > now ? `Atterrit à ${where} · ${relative(n.landing.time, now)}` : `Atterrie vers ${where} · ${ago(n.landing.time, now)}`;
  }
  const where = `À ${fmtDist(n.distM, units)}`;
  if (s.phase === 'landed') return `${where} · au sol`;
  if (s.phase === 'lost') return `${where} · ${ago(s.lastTime, now)}`;
  return `${where} · ${fmtAltShort(s.last.alt, units)}`;
}

function Direction({ deg }: { deg: number }) {
  const label = compass(deg);
  return (
    <span className="text-muted-foreground flex w-10 shrink-0 flex-col items-center gap-0.5" title={`Direction : ${label} (${Math.round(deg)}°)`}>
      <Navigation2 aria-hidden className="text-foreground/75 size-4 fill-current/20" style={{ transform: `rotate(${deg}deg)` }} />
      <span className="font-mono text-[10px] leading-none font-medium">{label}</span>
      <span className="sr-only">direction {label}</span>
    </span>
  );
}

const SondeRow = memo(function SondeRow({
  sonde: s,
  units,
  now,
  distanceM,
  active = false,
  near,
}: {
  sonde: Sonde;
  units: Units;
  now: number;
  distanceM?: number;
  active?: boolean;
  near?: NearbyInfo;
}) {
  const hovered = useStore((st) => st.hovered === s.serial);
  const { select, setHovered } = useStore.getState();
  const colour = PHASE_COLOUR[s.phase];
  const vv = s.last.vel_v;
  const flying = s.phase !== 'landed' && s.phase !== 'lost';
  const alts = useMemo(() => s.track.map((p) => p[2]), [s.track, s.track.length]);
  return (
    <div
      className={rowWrapper(hovered || active, active)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(s.serial)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(null)}
    >
      <button type="button" id={rowId(s.serial)} data-testid="sonde-row" data-nav-row onClick={() => select(s.serial, true)} className={ROW_BUTTON}>
        <span className="relative grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `${colour}1c` }}>
          <MapIcon id={`sonde-${s.phase}`} size={22} />
          {flying && now - s.lastTime < 60_000 && (
            <span className="live-dot absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-[var(--panel-solid)]" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-mono text-[13px] font-semibold">{s.serial}</span>
            <span className="text-muted-foreground truncate text-[11px]">{s.subtype ?? s.type}</span>
          </span>
          {near ? (
            <span className={cx('block truncate text-[11.5px]', near.landing && near.landing.time > now ? 'text-foreground/85 font-medium' : 'text-muted-foreground')}>
              {nearbyLine(s, near, units, now)}
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1.5 text-[11.5px] whitespace-nowrap">
              <span className="tabular text-foreground shrink-0 font-mono font-medium">{fmtAltShort(s.last.alt, units)}</span>
              {vv !== undefined && flying && (
                <span className="tabular shrink-0 font-mono" style={{ color: colour }}>
                  {fmtVSpeed(vv, units)}
                </span>
              )}
              <span className="min-w-0 truncate">· {ago(s.lastTime, now)}</span>
              {distanceM !== undefined && <span className="tabular shrink-0">· {(distanceM / 1000).toFixed(0)} km</span>}
            </span>
          )}
        </span>
        {near ? <Direction deg={near.bearing} /> : <Sparkline values={alts} colour={colour} />}
      </button>
      <FavButton serial={s.serial} />
    </div>
  );
});
