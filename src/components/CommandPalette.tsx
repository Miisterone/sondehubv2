import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bell, BellOff, Check, Clock, Crosshair, Eye, EyeOff, Info, Languages, LocateFixed, MapPinned, Megaphone, Moon, Mountain, RotateCcw, Sun, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { cx } from '@/components/ui';
import { Icon3D, SondeIcon3D } from '@/components/Icon3D';
import { openWhatsNew } from '@/components/WhatsNew';
import { useStore, type Duration, type Layers } from '@/store/useStore';
import { BASEMAPS } from '@/lib/basemaps';
import { ago, fmtAltShort } from '@/lib/format';
import { locateUser } from '@/lib/geolocation';
import { disableAlerts, enableAlerts } from '@/lib/alerts';
import type { LaunchSite, Listener, Sonde } from '@/lib/types';
import { LOCALES, setLocale, useLocale, useT, type TKey } from '@/i18n';

/** Window event other UI elements dispatch to open the palette. */
export const COMMAND_EVENT = 'sondehubv2:command';
/** Window event asking the sidebar to switch to its "Près de moi" mode. */
const NEARBY_EVENT = 'sondehubv2:nearby';

const MAX_SONDES = 8;
const MAX_FLYING = 6;
const MAX_STATIONS = 5;
const MAX_SITES = 5;

const DURATION_HOURS: Record<Duration, number> = {
  '1h': 1,
  '3h': 3,
  '6h': 6,
  '12h': 12,
  '1d': 24,
};

const LAYER_LABEL: Record<keyof Layers, { show: TKey; hide: TKey }> = {
  listeners: { show: 'app.command.layer.listeners.show', hide: 'app.command.layer.listeners.hide' },
  chase: { show: 'app.command.layer.chase.show', hide: 'app.command.layer.chase.hide' },
  sites: { show: 'app.command.layer.sites.show', hide: 'app.command.layer.sites.hide' },
  recoveries: { show: 'app.command.layer.recoveries.show', hide: 'app.command.layer.recoveries.hide' },
  landings: { show: 'app.command.layer.landings.show', hide: 'app.command.layer.landings.hide' },
  allPredictions: { show: 'app.command.layer.allPredictions.show', hide: 'app.command.layer.allPredictions.hide' },
  receiverLinks: { show: 'app.command.layer.receiverLinks.show', hide: 'app.command.layer.receiverLinks.hide' },
};

type GroupId = 'selected' | 'position' | 'display' | 'basemap' | 'history' | 'layers' | 'language' | 'help';

const GROUP_LABEL: Record<Exclude<GroupId, 'language'>, TKey> = {
  selected: 'app.command.group.selected',
  position: 'app.command.group.position',
  display: 'app.command.group.display',
  basemap: 'app.command.group.basemap',
  history: 'app.command.group.history',
  layers: 'app.command.group.layers',
  help: 'app.command.group.help',
};

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent,
  );

/** Lower-case, accent-free form used for matching ("Thème" ≈ "theme"). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** 0 = prefix, 1 = word prefix, 2 = substring, -1 = no match. */
function rank(hay: string, q: string): number {
  const i = hay.indexOf(q);
  if (i < 0) return -1;
  if (i === 0) return 0;
  return /[\s\-_(/'’]/.test(hay[i - 1]) ? 1 : 2;
}

/** Best rank of `q` over several fields, later fields weighted lower; -1 if none matches. */
function bestRank(q: string, ...fields: (string | undefined)[]): number {
  let best = -1;
  fields.forEach((f, idx) => {
    if (!f) return;
    const r = rank(f, q);
    // Mid-word matches only count on the primary field: "y" shouldn't hit "liberty".
    if (r >= 0 && (idx === 0 || r < 2)) {
      const w = r + idx * 3;
      if (best < 0 || w < best) best = w;
    }
  });
  return best;
}

function topMatches<T>(items: T[], max: number, score: (it: T) => number, key: (it: T) => string, tie?: (a: T, b: T) => number): T[] {
  const hits: { it: T; r: number; k: string }[] = [];
  for (const it of items) {
    const r = score(it);
    if (r >= 0) hits.push({ it, r, k: key(it) });
  }
  hits.sort((a, b) => a.r - b.r || (tie ? tie(a.it, b.it) : 0) || a.k.length - b.k.length || a.k.localeCompare(b.k));
  return hits.slice(0, max).map((h) => h.it);
}

const isFlying = (s: Sonde) => s.phase === 'ascending' || s.phase === 'descending';

interface Action {
  id: string;
  group: GroupId;
  label: string;
  keywords?: string;
  icon: ReactNode;
  hint?: ReactNode;
  active?: boolean;
  run: () => void;
}

export function CommandPalette({ onAbout }: { onAbout: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);

  const defer = useCallback((fn: () => void) => {
    afterClose.current = fn;
    setOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_EVENT, onOpen);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[12dvh] translate-y-0 gap-0 overflow-hidden rounded-lg border p-0 shadow-2xl sm:max-w-xl"
        onCloseAutoFocus={(e) => {
          const fn = afterClose.current;
          if (!fn) return;
          afterClose.current = null;
          e.preventDefault();
          fn();
        }}
      >
        <DialogTitle className="sr-only">{t('app.command.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('app.command.description')}</DialogDescription>
        {/* Mounted only while open, so the store subscriptions below cost nothing when closed. */}
        <PaletteBody close={() => setOpen(false)} defer={defer} onAbout={onAbout} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ close, defer, onAbout }: { close: () => void; defer: (fn: () => void) => void; onAbout: () => void }) {
  const t = useT();
  const locale = useLocale();
  const sondesMap = useStore((s) => s.sondes);
  const listenersMap = useStore((s) => s.listeners);
  const sites = useStore((s) => s.sites);
  const settings = useStore((s) => s.settings);
  const selected = useStore((s) => s.selected);
  const follow = useStore((s) => s.follow);
  const userLocation = useStore((s) => s.userLocation);
  const now = useStore((s) => s.now);

  const [query, setQuery] = useState('');
  const q = norm(query.trim());
  const [value, setValue] = useState('');

  // Source arrays with pre-normalised search keys, rebuilt only when the data changes.
  const sondes = useMemo(() => Object.values(sondesMap).map((s) => ({ s, serial: norm(s.serial), type: norm([s.type, s.subtype].filter(Boolean).join(' ')) })), [sondesMap]);
  const listeners = useMemo(() => Object.values(listenersMap).map((l) => ({ l, cs: norm(l.callsign) })), [listenersMap]);
  const siteKeys = useMemo(() => sites.map((site) => ({ site, name: norm(site.name), id: norm(site.id) })), [sites]);

  const sondeHits: Sonde[] = useMemo(() => {
    if (!q) {
      return sondes
        .filter(({ s }) => isFlying(s))
        .sort((a, b) => b.s.last.alt - a.s.last.alt)
        .slice(0, MAX_FLYING)
        .map(({ s }) => s);
    }
    return topMatches(
      sondes,
      MAX_SONDES,
      (x) => bestRank(q, x.serial, x.type),
      (x) => x.serial,
      // Equally good matches: flying sondes first, then the most recently heard.
      (a, b) => Number(isFlying(b.s)) - Number(isFlying(a.s)) || b.s.lastTime - a.s.lastTime,
    ).map((x) => x.s);
  }, [sondes, q]);

  const stationHits: Listener[] = useMemo(
    () => (q ? topMatches(listeners, MAX_STATIONS, (x) => bestRank(q, x.cs), (x) => x.cs).map((x) => x.l) : []),
    [listeners, q],
  );

  const siteHits: LaunchSite[] = useMemo(
    () => (q ? topMatches(siteKeys, MAX_SITES, (x) => bestRank(q, x.name, x.id), (x) => x.name).map((x) => x.site) : []),
    [siteKeys, q],
  );

  const actions: Action[] = useMemo(() => {
    const { setSettings, setLayer, select: sel, setFollow } = useStore.getState();
    const list: Action[] = [];
    const dark = settings.theme === 'dark';
    if (selected) {
      list.push({
        id: 'follow',
        group: 'selected',
        label: follow ? t('app.command.follow.stop', { serial: selected }) : t('app.command.follow.start', { serial: selected }),
        keywords: `${t('app.command.follow.keywords')} follow track suivre`,
        icon: <Crosshair />,
        hint: <Kbd>F</Kbd>,
        active: follow,
        run: () => setFollow(!follow),
      });
      list.push({
        id: 'deselect',
        group: 'selected',
        label: t('app.command.deselect.label'),
        keywords: `${t('app.command.deselect.keywords')} deselect close fermer`,
        icon: <X />,
        hint: <Kbd>{t('app.key.escape')}</Kbd>,
        run: () => sel(null),
      });
    }
    list.push({
      id: 'locate',
      group: 'position',
      label: t('app.common.locateMe'),
      keywords: `${t('app.command.locate.keywords')} locate location gps position localiser`,
      icon: <LocateFixed />,
      active: !!userLocation,
      run: () => void locateUser({ fly: true }),
    });
    list.push({
      id: 'nearby',
      group: 'position',
      label: t('app.command.nearby.label'),
      keywords: `${t('app.command.nearby.keywords')} nearby near proximite`,
      icon: <MapPinned />,
      run: () =>
        void locateUser({ fly: true }).then((ok) => {
          if (ok) window.dispatchEvent(new Event(NEARBY_EVENT));
        }),
    });
    const alertsOn = settings.alerts.enabled;
    list.push({
      id: 'alerts',
      group: 'position',
      label: alertsOn ? t('app.command.alerts.disable') : t('app.command.alerts.enable'),
      keywords: `${t('app.command.alerts.keywords')} alert alerte notification`,
      icon: alertsOn ? <BellOff /> : <Bell />,
      hint: <span className={cx('text-[11px] tracking-normal', alertsOn ? 'text-foreground' : 'text-muted-foreground')}>{alertsOn ? t('app.command.alerts.on') : t('app.command.alerts.off')}</span>,
      run: () => (alertsOn ? disableAlerts() : void enableAlerts()),
    });
    list.push({
      id: 'theme',
      group: 'display',
      label: dark ? t('app.command.theme.light') : t('app.command.theme.dark'),
      keywords: `${t('app.command.theme.keywords')} theme dark light sombre clair`,
      icon: dark ? <Sun /> : <Moon />,
      run: () => {
        const next = dark ? 'light' : 'dark';
        const b = settings.basemap;
        // Swap the vector basemap along with the UI theme; keep imagery/topo choices.
        const basemap = b === 'dark' && next === 'light' ? 'positron' : (b === 'positron' || b === 'liberty') && next === 'dark' ? 'dark' : b;
        setSettings({ theme: next, basemap });
      },
    });
    for (const b of BASEMAPS) {
      list.push({
        id: `basemap-${b.id}`,
        group: 'basemap',
        label: t('app.command.basemap.label', { name: b.label }),
        keywords: `${t('app.command.basemap.keywords')} basemap map fond carte ${b.id}`,
        icon: (
          <img
            src={b.preview}
            alt=""
            width={16}
            height={16}
            decoding="async"
            className="size-4 shrink-0 rounded-[4px] object-cover ring-1 ring-black/10 dark:ring-white/15"
            style={{ background: b.swatch }}
          />
        ),
        active: settings.basemap === b.id,
        run: () => setSettings({ basemap: b.id }),
      });
    }
    const terrainOn = settings.terrain;
    list.push({
      id: 'terrain',
      group: 'basemap',
      label: terrainOn ? t('app.command.terrain.disable') : t('app.command.terrain.enable'),
      keywords: `${t('app.command.terrain.keywords')} terrain relief 3d mountain montagne`,
      icon: <Mountain />,
      hint: <span className={cx('text-[11px] tracking-normal', terrainOn ? 'text-foreground' : 'text-muted-foreground')}>{terrainOn ? t('app.command.layer.shown') : t('app.command.layer.hidden')}</span>,
      run: () => setSettings({ terrain: !terrainOn }),
    });
    for (const d of Object.keys(DURATION_HOURS) as Duration[]) {
      list.push({
        id: `duration-${d}`,
        group: 'history',
        label: t('app.command.duration.label', { duration: t('app.command.duration.hours', { count: DURATION_HOURS[d] }) }),
        keywords: `${t('app.command.duration.keywords')} history historique ${d}`,
        icon: <Clock />,
        active: settings.duration === d,
        run: () => setSettings({ duration: d }),
      });
    }
    for (const key of Object.keys(LAYER_LABEL) as (keyof Layers)[]) {
      const on = settings.layers[key];
      list.push({
        id: `layer-${key}`,
        group: 'layers',
        label: t(on ? LAYER_LABEL[key].hide : LAYER_LABEL[key].show),
        keywords: `${t('app.command.layer.keywords')} layer show hide couche`,
        icon: on ? <EyeOff /> : <Eye />,
        hint: <span className={cx('text-[11px] tracking-normal', on ? 'text-foreground' : 'text-muted-foreground')}>{on ? t('app.command.layer.shown') : t('app.command.layer.hidden')}</span>,
        run: () => setLayer(key, !on),
      });
    }
    for (const l of LOCALES) {
      list.push({
        id: `locale-${l.code}`,
        group: 'language',
        label: l.name,
        keywords: `language langue ${l.code}`,
        icon: <Languages />,
        active: locale === l.code,
        run: () => void setLocale(l.code),
      });
    }
    list.push({
      id: 'about',
      group: 'help',
      label: t('app.command.about.label'),
      keywords: `${t('app.command.about.keywords')} about help aide sondehub faq`,
      icon: <Info />,
      run: onAbout,
    });
    list.push({
      id: 'whatsNew',
      group: 'help',
      label: t('app.whatsNew.title'),
      keywords: `${t('app.command.whatsNew.keywords')} changelog news nouveautes`,
      icon: <Megaphone />,
      run: () => defer(openWhatsNew),
    });
    list.push({
      id: 'intro',
      group: 'help',
      label: t('app.common.replayIntro'),
      keywords: `${t('app.command.intro.keywords')} introduction onboarding welcome bienvenue`,
      icon: <RotateCcw />,
      run: () => setSettings({ tutorialDone: false }),
    });
    return list;
  }, [settings, selected, follow, userLocation, onAbout, defer, t, locale]);

  const groupLabel = useCallback((g: GroupId) => (g === 'language' ? t('app.language') : t(GROUP_LABEL[g])), [t]);

  const actionKeys = useMemo(
    () => actions.map((a) => ({ a, label: norm(a.label), kw: norm(`${groupLabel(a.group)} ${a.keywords ?? ''}`) })),
    [actions, groupLabel],
  );

  const actionHits: Action[] = useMemo(() => {
    if (!q) return actions;
    const words = q.split(/\s+/);
    const hits: { a: Action; r: number; i: number }[] = [];
    actionKeys.forEach(({ a, label, kw }, i) => {
      let total = 0;
      for (const w of words) {
        const r = bestRank(w, label, kw);
        if (r < 0) return;
        total += r;
      }
      hits.push({ a, r: total, i });
    });
    // Prefix matches first, then keep the natural order of the list.
    hits.sort((x, y) => Math.min(x.r, 1) - Math.min(y.r, 1) || x.i - y.i);
    return hits.map((h) => h.a);
  }, [actions, actionKeys, q]);

  const actionGroups = useMemo(() => {
    const groups = new Map<Action['group'], Action[]>();
    for (const a of actionHits) {
      const g = groups.get(a.group);
      if (g) g.push(a);
      else groups.set(a.group, [a]);
    }
    return [...groups];
  }, [actionHits]);

  // Highlight the first result whenever the query changes (cmdk doesn't when it isn't filtering).
  const first = sondeHits[0] ? `sonde:${sondeHits[0].serial}` : stationHits[0] ? `station:${stationHits[0].callsign}` : siteHits[0] ? `site:${siteHits[0].id}` : actionHits[0] ? `action:${actionHits[0].id}` : '';
  useEffect(() => {
    setValue(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const run = useCallback(
    (fn: () => void) => {
      close();
      fn();
    },
    [close],
  );

  const sections: ReactNode[] = [];

  if (sondeHits.length) {
    sections.push(
      <CommandGroup key="sondes" heading={q ? t('app.command.section.sondes') : t('app.command.section.flying')}>
        {sondeHits.map((s) => (
          <CommandItem key={s.serial} value={`sonde:${s.serial}`} onSelect={() => run(() => useStore.getState().select(s.serial, true))}>
            <SondeIcon3D sonde={s} className="-my-1 size-8!" />
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate tabular font-semibold">{s.serial}</span>
              <span className="text-muted-foreground truncate text-xs">{[s.type, s.subtype && s.subtype !== s.type ? s.subtype : null].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end leading-tight">
              <span className="tabular text-xs font-semibold">{fmtAltShort(s.last.alt, settings.units)}</span>
              <span className="text-muted-foreground text-[10.5px]">{ago(s.lastTime, now)}</span>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }

  if (stationHits.length) {
    sections.push(
      <CommandGroup key="stations" heading={t('app.command.section.stations')}>
        {stationHits.map((l) => (
          <CommandItem
            key={l.callsign}
            value={`station:${l.callsign}`}
            onSelect={() =>
              run(() => useStore.getState().selectListener(l.callsign, true))
            }
          >
            <Icon3D id={l.mobile ? 'chase' : 'station'} className="-my-1 size-8!" />
            <span className="truncate tabular font-medium">{l.callsign}</span>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs">{l.mobile ? t('app.command.station.mobile') : t('app.command.station.fixed')}</span>
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }

  if (siteHits.length) {
    sections.push(
      <CommandGroup key="sites" heading={t('app.command.section.sites')}>
        {siteHits.map((site) => (
          <CommandItem key={site.id} value={`site:${site.id}`} onSelect={() => run(() => useStore.getState().selectSite(site.id, true))}>
            <Icon3D id="launch" className="-my-1 size-8!" />
            <span className="truncate">{site.name}</span>
            {site.types.length > 0 && <span className="text-muted-foreground ml-auto max-w-[40%] shrink-0 truncate text-xs">{site.types.slice(0, 3).join(', ')}</span>}
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }

  for (const [group, items] of actionGroups) {
    sections.push(
      <CommandGroup key={`a-${group}`} heading={groupLabel(group)}>
        {items.map((a) => (
          <CommandItem key={a.id} value={`action:${a.id}`} onSelect={() => run(a.run)}>
            {a.icon}
            <span className="truncate">{a.label}</span>
            {(a.hint || a.active) && (
              <CommandShortcut className="flex items-center gap-1.5 tracking-normal">
                {a.hint}
                {a.active && !a.hint && <Check className="text-primary size-4" />}
              </CommandShortcut>
            )}
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }

  return (
    <Command
      shouldFilter={false}
      value={value}
      onValueChange={setValue}
      loop
      className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:text-muted-foreground bg-popover rounded-none [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-item]]:py-2"
    >
      <div className="relative">
        <CommandInput value={query} onValueChange={setQuery} placeholder={t('app.command.placeholder')} className="h-12 text-[15px] sm:pr-14" autoFocus />
        <Kbd className="absolute top-1/2 right-3 -translate-y-1/2 max-sm:hidden">{isMac ? '⌘K' : t('app.key.ctrlK')}</Kbd>
      </div>
      <CommandList className="max-h-[min(440px,58dvh)] overscroll-contain">
        <CommandEmpty>{t('app.command.empty')}</CommandEmpty>
        {sections.flatMap((s, i) => (i === 0 ? [s] : [<CommandSeparator key={`sep-${i}`} className="mx-0 my-1" />, s]))}
      </CommandList>
      <div className="text-muted-foreground bg-muted/40 flex items-center gap-4 border-t px-3 py-2 text-[11px] max-sm:hidden">
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </KbdGroup>
          {t('app.command.footer.navigate')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          {t('app.command.footer.open')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>{t('app.key.escape')}</Kbd>
          {t('app.command.footer.close')}
        </span>
        <span className="ml-auto truncate">
          {t('app.command.footer.sondes', { count: sondes.length })} · {t('app.command.footer.stations', { count: listeners.length })} ·{' '}
          {t('app.command.footer.sites', { count: sites.length })}
        </span>
      </div>
    </Command>
  );
}
