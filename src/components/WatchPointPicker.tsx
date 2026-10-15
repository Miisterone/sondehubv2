import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronDown, Crosshair, LoaderCircle, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { fmtPoint, parseCoords, searchPlaces, zoomForRadius, type Centre, type Place } from '@/lib/watchPoint';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cx } from './ui';
import { getMap } from './MapView';

type SearchState = { status: 'idle' } | { status: 'loading' } | { status: 'done'; places: Place[] } | { status: 'error' };

const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

export function CentreBar({ centre, open, onToggle }: { centre: Centre; open: boolean; onToggle: () => void }) {
  const tr = useT();
  const label = centre.kind === 'point' ? centre.label || fmtPoint(centre.lat, centre.lon) : tr('sidebar.nearby.myPosition');
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4">
      <span className="shrink-0 text-[13px]">{tr('sidebar.nearby.around')}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={tr('sidebar.nearby.changeCentre', { place: label })}
        className="bg-background text-foreground hover:bg-surface focus-visible:ring-ring/50 inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium outline-none focus-visible:ring-2"
      >
        {centre.kind === 'point' ? <MapPin className="text-primary size-3.5 shrink-0" /> : <LocateFixed className="text-primary size-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
        <ChevronDown className={cx('text-muted-foreground size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  );
}

export function PointEditor({
  onDone,
  onCancel,
  onUseGps,
  onFocusInput,
  autoFocus = true,
  showCancel = true,
  className,
}: {
  onDone: () => void;
  showCancel?: boolean;
  onCancel?: () => void;
  onUseGps?: () => void;
  onFocusInput?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const tr = useT();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [active, setActive] = useState(0);
  const coords = parseCoords(query);
  const q = query.trim();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    setActive(0);
    if (coords || q.length < MIN_QUERY) {
      setSearch({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setSearch({ status: 'loading' });
    const timer = window.setTimeout(() => {
      const c = getMap()?.getCenter();
      searchPlaces(q, c ? { lat: c.lat, lon: c.lng } : null, ctrl.signal)
        .then((places) => setSearch({ status: 'done', places }))
        .catch(() => !ctrl.signal.aborted && setSearch({ status: 'error' }));
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, !!coords]);

  const choose = (lat: number, lon: number, label: string) => {
    const st = useStore.getState();
    st.setWatchPoint({ lat, lon, label });
    st.requestFly(lon, lat, zoomForRadius(st.settings.alerts.radiusKm));
    onDone();
  };

  const options: { key: string; title: string; detail: string; pick: () => void }[] = coords
    ? [{ key: 'coords', title: fmtPoint(coords[0], coords[1]), detail: tr('sidebar.point.coords'), pick: () => choose(coords[0], coords[1], fmtPoint(coords[0], coords[1])) }]
    : search.status === 'done'
      ? search.places.map((p) => ({ key: p.id, title: p.name, detail: p.detail, pick: () => choose(p.lat, p.lon, p.name) }))
      : [];

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && options[active]) {
      e.preventDefault();
      options[active].pick();
    } else if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const startPicking = () => {
    useStore.getState().setPickingPoint(true);
    onDone();
  };

  return (
    <div className={cx('px-5 pt-3', className)}>
      <div className="relative">
        <Search className="text-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={onFocusInput}
          onKeyDown={onKey}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={tr('sidebar.point.placeholder')}
          aria-label={tr('sidebar.point.inputLabel')}
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          className="bg-background text-foreground placeholder:text-faint h-9 rounded-md pr-9 pl-9 text-[14px] md:text-[14px] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label={tr('sidebar.point.clear')}
            className="text-muted-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {search.status === 'loading' && (
          <p className="flex items-center gap-2 pt-3 text-[13px]">
            <LoaderCircle className="text-primary size-4 animate-spin" />
            {tr('sidebar.point.searching')}
          </p>
        )}
        {search.status === 'error' && <p className="pt-3 text-[13px] leading-relaxed">{tr('sidebar.point.error')}</p>}
        {search.status === 'done' && options.length === 0 && <p className="pt-3 text-[13px] leading-relaxed">{tr('sidebar.point.noResult')}</p>}
      </div>

      {options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={tr('sidebar.point.inputLabel')} className="mt-2 overflow-hidden rounded-md border">
          {options.map((o, i) => (
            <li key={o.key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="border-b last:border-b-0">
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={o.pick}
                className={cx('flex w-full items-start gap-2.5 px-3 py-2.5 text-left outline-none', i === active && 'bg-surface')}
              >
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-[13.5px] font-semibold">{o.title}</span>
                  {o.detail && <span className="block truncate text-[12.5px]">{o.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={startPicking}>
          <Crosshair />
          {tr('sidebar.point.pickOnMap')}
        </Button>
        {onUseGps && (
          <Button variant="ghost" size="sm" onClick={onUseGps}>
            <LocateFixed />
            {tr('sidebar.point.useGps')}
          </Button>
        )}
        {onCancel && showCancel && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
            {tr('sidebar.point.cancel')}
          </Button>
        )}
      </div>
      <p className="text-faint pt-2 text-[12px]">{tr('sidebar.point.attribution')}</p>
    </div>
  );
}

export function PickBanner() {
  const picking = useStore((s) => s.pickingPoint);
  const tr = useT();

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      useStore.getState().setPickingPoint(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);

  if (!picking) return null;
  const touch = window.matchMedia('(hover: none)').matches;
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center pr-13 md:left-[380px] md:pr-16">
      <div role="status" className="bg-background pointer-events-auto flex min-w-0 items-center gap-3 rounded-lg border py-2 pr-2 pl-3.5">
        <Crosshair className="text-primary size-4 shrink-0" />
        <p className="text-foreground min-w-0 text-[13px] leading-snug font-medium">{tr(touch ? 'map.pick.touch' : 'map.pick.click')}</p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => useStore.getState().setPickingPoint(false)}>
          {tr('map.pick.cancel')}
        </Button>
      </div>
    </div>
  );
}
