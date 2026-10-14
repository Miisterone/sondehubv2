import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, BellOff, Check, Clock, Crosshair, Eye, EyeOff, Info, LocateFixed, MapPinned, Moon, RotateCcw, Sun, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { MapIcon, cx } from '@/components/ui';
import { useStore, type Duration, type Layers } from '@/store/useStore';
import { BASEMAPS } from '@/lib/basemaps';
import { ago, fmtAltShort } from '@/lib/format';
import { locateUser } from '@/lib/geolocation';
import { disableAlerts, enableAlerts } from '@/lib/alerts';
import type { LaunchSite, Listener, Sonde } from '@/lib/types';

/** Window event other UI elements dispatch to open the palette. */
export const COMMAND_EVENT = 'sondehubv2:command';
/** Window event asking the sidebar to switch to its "Près de moi" mode. */
const NEARBY_EVENT = 'sondehubv2:nearby';

const MAX_SONDES = 8;
const MAX_FLYING = 6;
const MAX_STATIONS = 5;
const MAX_SITES = 5;

const DURATION_LABEL: Record<Duration, string> = {
  '1h': '1 heure',
  '3h': '3 heures',
  '6h': '6 heures',
  '12h': '12 heures',
  '1d': '24 heures',
};

const LAYER_LABEL: Record<keyof Layers, string> = {
  listeners: 'les stations de réception',
  chase: 'les véhicules de poursuite',
  sites: 'les sites de lâcher',
  recoveries: 'les sondes récupérées',
  landings: 'les points d’atterrissage',
  allPredictions: 'toutes les trajectoires prévues',
  receiverLinks: 'les liens sonde ↔ récepteurs',
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
  group: 'Ma position' | 'Affichage' | 'Fond de carte' | 'Historique' | 'Couches' | 'Sonde sélectionnée' | 'Aide';
  label: string;
  keywords?: string;
  icon: ReactNode;
  hint?: ReactNode;
  active?: boolean;
  run: () => void;
}

export function CommandPalette({ onAbout }: { onAbout: () => void }) {
  const [open, setOpen] = useState(false);

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
      >
        <DialogTitle className="sr-only">Palette de commandes</DialogTitle>
        <DialogDescription className="sr-only">Rechercher une sonde, une station, un site de lâcher ou une action.</DialogDescription>
        {/* Mounted only while open, so the store subscriptions below cost nothing when closed. */}
        <PaletteBody close={() => setOpen(false)} onAbout={onAbout} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ close, onAbout }: { close: () => void; onAbout: () => void }) {
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
        group: 'Sonde sélectionnée',
        label: follow ? `Arrêter de suivre ${selected}` : `Suivre la sonde ${selected}`,
        keywords: 'suivre suivi camera centrer follow',
        icon: <Crosshair />,
        hint: <Kbd>F</Kbd>,
        active: follow,
        run: () => setFollow(!follow),
      });
      list.push({
        id: 'deselect',
        group: 'Sonde sélectionnée',
        label: 'Désélectionner la sonde',
        keywords: 'deselectionner fermer annuler selection',
        icon: <X />,
        hint: <Kbd>Échap</Kbd>,
        run: () => sel(null),
      });
    }
    list.push({
      id: 'locate',
      group: 'Ma position',
      label: 'Me localiser',
      keywords: 'position localiser geolocalisation gps ou suis je centrer moi',
      icon: <LocateFixed />,
      active: !!userLocation,
      run: () => void locateUser({ fly: true }),
    });
    list.push({
      id: 'nearby',
      group: 'Ma position',
      label: 'Sondes près de moi',
      keywords: 'proximite proche autour position atterrissage pres chez moi distance',
      icon: <MapPinned />,
      run: () =>
        void locateUser({ fly: true }).then((ok) => {
          if (ok) window.dispatchEvent(new Event(NEARBY_EVENT));
        }),
    });
    const alertsOn = settings.alerts.enabled;
    list.push({
      id: 'alerts',
      group: 'Ma position',
      label: alertsOn ? 'Désactiver les alertes d’atterrissage' : 'Activer les alertes d’atterrissage',
      keywords: 'alerte alertes notification prevenir atterrissage position',
      icon: alertsOn ? <BellOff /> : <Bell />,
      hint: <span className={cx('text-[11px] tracking-normal', alertsOn ? 'text-foreground' : 'text-muted-foreground')}>{alertsOn ? 'activées' : 'désactivées'}</span>,
      run: () => (alertsOn ? disableAlerts() : void enableAlerts()),
    });
    list.push({
      id: 'theme',
      group: 'Affichage',
      label: dark ? 'Passer au thème clair' : 'Passer au thème sombre',
      keywords: 'theme clair sombre jour nuit light dark mode apparence',
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
        group: 'Fond de carte',
        label: `Fond de carte : ${b.label}`,
        keywords: `fond carte basemap ${b.id}`,
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
    for (const d of Object.keys(DURATION_LABEL) as Duration[]) {
      list.push({
        id: `duration-${d}`,
        group: 'Historique',
        label: `Historique : ${DURATION_LABEL[d]}`,
        keywords: `historique periode duree ${d} heures jour`,
        icon: <Clock />,
        active: settings.duration === d,
        run: () => setSettings({ duration: d }),
      });
    }
    for (const key of Object.keys(LAYER_LABEL) as (keyof Layers)[]) {
      const on = settings.layers[key];
      list.push({
        id: `layer-${key}`,
        group: 'Couches',
        label: `${on ? 'Masquer' : 'Afficher'} ${LAYER_LABEL[key]}`,
        keywords: 'couche calque afficher masquer cacher montrer',
        icon: on ? <EyeOff /> : <Eye />,
        hint: <span className={cx('text-[11px] tracking-normal', on ? 'text-foreground' : 'text-muted-foreground')}>{on ? 'affiché' : 'masqué'}</span>,
        run: () => setLayer(key, !on),
      });
    }
    list.push({ id: 'about', group: 'Aide', label: 'À propos de SondeHub V2', keywords: 'a propos aide info credits sondehub faq questions', icon: <Info />, run: onAbout });
    list.push({
      id: 'intro',
      group: 'Aide',
      label: 'Revoir l’introduction',
      keywords: 'introduction bienvenue tutoriel aide decouvrir debut onboarding',
      icon: <RotateCcw />,
      run: () => setSettings({ onboarded: false }),
    });
    return list;
  }, [settings, selected, follow, userLocation, onAbout]);

  const actionKeys = useMemo(() => actions.map((a) => ({ a, label: norm(a.label), kw: norm(`${a.group} ${a.keywords ?? ''}`) })), [actions]);

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
      <CommandGroup key="sondes" heading={q ? 'Sondes' : 'Sondes en vol'}>
        {sondeHits.map((s) => (
          <CommandItem key={s.serial} value={`sonde:${s.serial}`} onSelect={() => run(() => useStore.getState().select(s.serial, true))}>
            <MapIcon id={`sonde-${s.phase}`} size={22} />
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
      <CommandGroup key="stations" heading="Stations de réception">
        {stationHits.map((l) => (
          <CommandItem
            key={l.callsign}
            value={`station:${l.callsign}`}
            onSelect={() =>
              run(() => useStore.getState().selectListener(l.callsign, true))
            }
          >
            <MapIcon id={l.mobile ? 'chase' : 'listener'} size={20} />
            <span className="truncate tabular font-medium">{l.callsign}</span>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs">{l.mobile ? 'Poursuite' : 'Fixe'}</span>
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }

  if (siteHits.length) {
    sections.push(
      <CommandGroup key="sites" heading="Sites de lâcher">
        {siteHits.map((site) => (
          <CommandItem key={site.id} value={`site:${site.id}`} onSelect={() => run(() => useStore.getState().selectSite(site.id, true))}>
            <MapIcon id="site" size={18} />
            <span className="truncate">{site.name}</span>
            {site.types.length > 0 && <span className="text-muted-foreground ml-auto max-w-[40%] shrink-0 truncate text-xs">{site.types.slice(0, 3).join(', ')}</span>}
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }

  for (const [group, items] of actionGroups) {
    sections.push(
      <CommandGroup key={`a-${group}`} heading={group}>
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
        <CommandInput value={query} onValueChange={setQuery} placeholder="Sonde, indicatif, site de lâcher, action…" className="h-12 text-[15px] sm:pr-14" autoFocus />
        <Kbd className="absolute top-1/2 right-3 -translate-y-1/2 max-sm:hidden">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
      </div>
      <CommandList className="max-h-[min(440px,58dvh)] overscroll-contain">
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        {sections.flatMap((s, i) => (i === 0 ? [s] : [<CommandSeparator key={`sep-${i}`} className="mx-0 my-1" />, s]))}
      </CommandList>
      <div className="text-muted-foreground bg-muted/40 flex items-center gap-4 border-t px-3 py-2 text-[11px] max-sm:hidden">
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </KbdGroup>
          naviguer
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          ouvrir
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Échap</Kbd>
          fermer
        </span>
        <span className="ml-auto truncate">
          {sondes.length} sondes · {listeners.length} stations · {sites.length} sites
        </span>
      </div>
    </Command>
  );
}
