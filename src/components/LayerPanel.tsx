import { useState } from 'react';
import { Bell, BellRing, Layers as LayersIcon, LocateFixed, MapPin, Moon, Sun } from 'lucide-react';
import { useStore, type Layers } from '@/store/useStore';
import { BASEMAPS } from '@/lib/basemaps';
import type { IconId } from '@/lib/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { locateUser } from '@/lib/geolocation';
import { disableAlerts, enableAlerts } from '@/lib/alerts';
import { IconButton, MapIcon, Segmented, Toggle, cx } from './ui';
import { t, useT } from '@/i18n';

const overlay = (key: keyof Layers, icon: IconId) => ({
  key,
  icon,
  get label() {
    return t(`map.layers.${key}.label`);
  },
  get hint() {
    return t(`map.layers.${key}.hint`);
  },
});

const OVERLAYS: { key: keyof Layers; label: string; hint: string; icon: IconId }[] = [
  overlay('landings', 'landing'),
  overlay('allPredictions', 'burst'),
  overlay('listeners', 'listener'),
  overlay('chase', 'chase'),
  overlay('receiverLinks', 'listener'),
  overlay('sites', 'site'),
  overlay('recoveries', 'recovery-ok'),
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
  return <h3 className="mb-2 px-0.5 text-[14px] font-semibold">{children}</h3>;
}

const RADII = [25, 50, 100, 200] as const;

/** Landing alerts: master switch, radius, favourites and position status. */
function AlertsSection() {
  const alerts = useStore((s) => s.settings.alerts);
  const nFavs = useStore((s) => s.settings.favourites.length);
  const loc = useStore((s) => s.userLocation);
  const { setAlerts } = useStore.getState();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const toggleMaster = async (on: boolean) => {
    if (!on) return disableAlerts();
    setBusy(true);
    try {
      await enableAlerts();
    } finally {
      setBusy(false);
    }
  };

  const locate = async () => {
    setLocating(true);
    await locateUser({ fly: true });
    setLocating(false);
  };

  return (
    <section aria-labelledby="alerts-title">
      <h3 id="alerts-title" className="mb-2 flex items-center gap-1.5 px-0.5 text-[14px] font-semibold">
        <Bell className="size-3.5" aria-hidden /> {t('map.alerts.title')}
      </h3>
      <div className="-mx-1.5">
        <Toggle
          checked={alerts.enabled || busy}
          onChange={(v) => void toggleMaster(v)}
          label={busy ? t('map.alerts.enabling') : t('map.alerts.enable')}
          hint={t('map.alerts.enableHint')}
          swatch={
            <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', alerts.enabled ? 'bg-primary/10 text-primary' : 'bg-chip text-muted-foreground')}>
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
                {t('map.alerts.position', { lat: loc.lat.toFixed(2), lon: loc.lon.toFixed(2) })}
              </span>
            ) : (
              <>
                <span className="truncate">{t('map.alerts.positionUnknown')}</span>
                <Button variant="link" size="sm" className="h-auto gap-1 p-0 text-[12px]" disabled={locating} onClick={() => void locate()}>
                  <LocateFixed className="size-3.5" /> {locating ? t('map.alerts.locating') : t('map.alerts.locate')}
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-0.5 py-1">
            <span className="text-[13px] font-medium">{t('map.alerts.radius')}</span>
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
              label={t('map.alerts.favourites')}
              hint={nFavs ? t('map.alerts.favouritesHintCount', { count: nFavs }) : t('map.alerts.favouritesHint')}
            />
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
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label={t('map.layers.button')} active={open}>
          <LayersIcon size={18} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="glass scroll-thin w-[320px] max-w-[calc(100vw-5rem)] overflow-y-auto rounded-lg p-3"
        style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
      >
        <SectionTitle>{t('map.layers.basemap')}</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {BASEMAPS.map((b) => {
            const selected = settings.basemap === b.id;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSettings({ basemap: b.id })}
                className="group focus-visible:ring-ring/50 rounded-lg text-center outline-none focus-visible:ring-[3px]"
              >
                <span
                  className={cx(
                    'ring-offset-background block h-11 overflow-hidden rounded-md ring-offset-2 transition-[box-shadow]',
                    selected ? 'ring-primary ring-2' : 'ring-border group-hover:ring-foreground/25 ring-1 ring-offset-0',
                  )}
                  style={{ background: b.swatch }}
                >
                  <img src={b.preview} alt="" width={160} height={76} decoding="async" draggable={false} className="size-full object-cover" />
                </span>
                <span className={cx('mt-1.5 block text-[11px]', selected ? 'text-foreground font-semibold' : 'text-muted-foreground')}>{b.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <SectionTitle>{t('map.layers.overlays')}</SectionTitle>
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
            <span className="text-[13px] font-medium">{t('map.layers.units')}</span>
            <Segmented
              size="sm"
              value={settings.units}
              onChange={(units) => setSettings({ units })}
              options={[
                { value: 'metric', label: t('map.layers.metric') },
                { value: 'imperial', label: t('map.layers.imperial') },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium">{t('map.layers.theme')}</span>
            <Segmented
              size="sm"
              value={settings.theme}
              onChange={setTheme}
              options={[
                {
                  value: 'dark',
                  label: (
                    <>
                      <Moon className="size-3" /> {t('map.layers.dark')}
                    </>
                  ),
                },
                {
                  value: 'light',
                  label: (
                    <>
                      <Sun className="size-3" /> {t('map.layers.light')}
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
