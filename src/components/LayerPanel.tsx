import { useEffect, useState } from 'react';
import { Bell, BellRing, Layers as LayersIcon, LocateFixed, MapPin, Moon, Sun } from 'lucide-react';
import { useStore, type Layers } from '@/store/useStore';
import { BASEMAPS } from '@/lib/basemaps';
import type { IconId } from '@/lib/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { locateUser } from '@/lib/geolocation';
import { disableAlerts, enableAlerts, notificationPermission, setSystemNotifications, type NotifPermission } from '@/lib/alerts';
import { IconButton, MapIcon, Segmented, Toggle, cx } from './ui';

const OVERLAYS: { key: keyof Layers; label: string; hint: string; icon: IconId }[] = [
  { key: 'landings', label: 'Points d’atterrissage', hint: 'Prédiction pour chaque sonde en vol', icon: 'landing' },
  { key: 'allPredictions', label: 'Toutes les trajectoires prévues', hint: 'Sinon seulement la sonde sélectionnée', icon: 'burst' },
  { key: 'listeners', label: 'Stations de réception', hint: 'Radioamateurs qui décodent les sondes', icon: 'listener' },
  { key: 'chase', label: 'Véhicules de poursuite', hint: 'Chasseurs en route vers une sonde', icon: 'chase' },
  { key: 'receiverLinks', label: 'Liens sonde ↔ récepteurs', hint: 'Pour la sonde sélectionnée', icon: 'listener' },
  { key: 'sites', label: 'Sites de lâcher', hint: 'Stations météo officielles', icon: 'site' },
  { key: 'recoveries', label: 'Sondes récupérées', hint: 'Signalements des 3 derniers jours', icon: 'recovery-ok' },
];

/** Switch the UI theme, swapping the vector basemap along with it (imagery/topo choices are kept). */
export function setTheme(next: 'dark' | 'light') {
  const { settings, setSettings } = useStore.getState();
  if (settings.theme === next) return;
  const b = settings.basemap;
  const basemap = b === 'dark' && next === 'light' ? 'positron' : (b === 'positron' || b === 'liberty') && next === 'dark' ? 'dark' : b;
  setSettings({ theme: next, basemap });
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-muted-foreground mb-2 px-0.5 text-[11px] font-semibold tracking-wider uppercase">{children}</h3>;
}

const RADII = [25, 50, 100, 200] as const;

/** Landing alerts: master switch, radius, favourites, system notifications and position status. */
function AlertsSection() {
  const alerts = useStore((s) => s.settings.alerts);
  const nFavs = useStore((s) => s.settings.favourites.length);
  const loc = useStore((s) => s.userLocation);
  const { setAlerts } = useStore.getState();
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [perm, setPerm] = useState<NotifPermission>(notificationPermission);

  // The permission can change in the browser's site settings while the page is open.
  useEffect(() => {
    let status: PermissionStatus | undefined;
    const sync = () => setPerm(notificationPermission());
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((p) => {
        status = p;
        p.addEventListener('change', sync);
      })
      .catch(() => {});
    return () => status?.removeEventListener('change', sync);
  }, []);

  const toggleMaster = async (on: boolean) => {
    if (!on) return disableAlerts();
    setBusy(true);
    try {
      await enableAlerts();
    } finally {
      setBusy(false);
      setPerm(notificationPermission());
    }
  };

  const toggleSystem = async (on: boolean) => {
    await setSystemNotifications(on);
    setPerm(notificationPermission());
  };

  const locate = async () => {
    setLocating(true);
    await locateUser({ fly: true });
    setLocating(false);
  };

  const systemHint =
    perm === 'denied'
      ? 'Bloquées par le navigateur — autorisez-les dans les réglages du site'
      : perm === 'unsupported'
        ? 'Non prises en charge par ce navigateur'
        : 'Quand SondeTrack est en arrière-plan';

  return (
    <section aria-labelledby="alerts-title">
      <h3 id="alerts-title" className="text-muted-foreground mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold tracking-wider uppercase">
        <Bell className="size-3.5" aria-hidden /> Alertes d’atterrissage
      </h3>
      <div className="-mx-1.5">
        <Toggle
          checked={alerts.enabled || busy}
          onChange={(v) => void toggleMaster(v)}
          label={busy ? 'Activation…' : 'M’alerter des atterrissages'}
          hint="Quand une sonde doit tomber près de vous"
          swatch={
            <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', alerts.enabled ? 'bg-amber-500/15 text-amber-500' : 'bg-chip text-muted-foreground')}>
              {alerts.enabled ? <BellRing className="size-4" /> : <Bell className="size-4" />}
            </span>
          }
        />
      </div>

      {alerts.enabled && (
        <div className="mt-1 space-y-1">
          <div className="text-muted-foreground flex min-h-7 items-center gap-1.5 px-0.5 text-[12px]">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {loc ? (
              <span className="tabular truncate">
                Position : {loc.lat.toFixed(2)}, {loc.lon.toFixed(2)}
              </span>
            ) : (
              <>
                <span className="truncate">Position inconnue —</span>
                <Button variant="link" size="sm" className="h-auto gap-1 p-0 text-[12px]" disabled={locating} onClick={() => void locate()}>
                  <LocateFixed className="size-3.5" /> {locating ? 'Recherche…' : 'Me localiser'}
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-0.5 py-1">
            <span className="text-[13px] font-medium">Rayon</span>
            <Segmented
              size="sm"
              value={String(alerts.radiusKm)}
              onChange={(v) => setAlerts({ radiusKm: Number(v) })}
              options={RADII.map((r) => ({ value: String(r), label: `${r} km` }))}
            />
          </div>
          <div className="-mx-1.5">
            <Toggle
              checked={alerts.favourites}
              onChange={(v) => setAlerts({ favourites: v })}
              label="Sondes suivies"
              hint={`Éclatement et atterrissage imminent, partout${nFavs ? ` (${nFavs} suivie${nFavs > 1 ? 's' : ''})` : ''}`}
            />
            {perm !== 'unsupported' && (
              <Toggle
                checked={alerts.system && perm === 'granted'}
                onChange={(v) => void toggleSystem(v)}
                label="Notifications système"
                hint={systemHint}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Layers button + popover with basemaps, overlays, units and theme. */
export function LayerPanel() {
  const settings = useStore((s) => s.settings);
  const { setSettings, setLayer } = useStore.getState();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label="Couches & fonds de carte" active={open}>
          <LayersIcon size={18} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="glass scroll-thin w-[320px] max-w-[calc(100vw-5rem)] overflow-y-auto rounded-2xl p-3"
        style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
      >
        <SectionTitle>Fond de carte</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {BASEMAPS.map((b) => {
            const selected = settings.basemap === b.id;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSettings({ basemap: b.id })}
                className="group focus-visible:ring-ring/50 rounded-xl text-center outline-none focus-visible:ring-[3px]"
              >
                <span
                  className={cx(
                    'ring-offset-background block h-11 rounded-lg ring-offset-2 transition-all',
                    selected ? 'ring-primary shadow-primary/30 shadow-md ring-2' : 'ring-border group-hover:ring-1',
                  )}
                  style={{ background: b.swatch }}
                />
                <span className={cx('mt-1.5 block text-[11px]', selected ? 'text-foreground font-semibold' : 'text-muted-foreground')}>{b.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <SectionTitle>Couches</SectionTitle>
          <div className="-mx-1.5">
            {OVERLAYS.map((o) => (
              <Toggle
                key={o.key}
                checked={settings.layers[o.key]}
                onChange={(v) => setLayer(o.key, v)}
                label={o.label}
                hint={o.hint}
                swatch={
                  <span className="bg-chip grid size-8 shrink-0 place-items-center rounded-lg">
                    <MapIcon id={o.icon} size={20} />
                  </span>
                }
              />
            ))}
          </div>
        </div>

        <Separator className="my-3" />

        <AlertsSection />

        <Separator className="my-3" />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium">Unités</span>
            <Segmented
              size="sm"
              value={settings.units}
              onChange={(units) => setSettings({ units })}
              options={[
                { value: 'metric', label: 'Métrique' },
                { value: 'imperial', label: 'Impérial' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium">Thème</span>
            <Segmented
              size="sm"
              value={settings.theme}
              onChange={setTheme}
              options={[
                {
                  value: 'dark',
                  label: (
                    <>
                      <Moon className="size-3" /> Sombre
                    </>
                  ),
                },
                {
                  value: 'light',
                  label: (
                    <>
                      <Sun className="size-3" /> Clair
                    </>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
