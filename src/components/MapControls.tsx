import { useEffect, useState } from 'react';
import { Compass, LocateFixed, Minus, Moon, Plus, Search, Sun } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { getMap } from './MapView';
import { locateUser } from '@/lib/geolocation';
import { PALETTE_SHORTCUT } from '@/lib/platform';
import { IconButton } from './ui';
import { LayerPanel, setTheme } from './LayerPanel';
import { useT } from '@/i18n';

const group = 'bg-background pointer-events-auto flex flex-col gap-0.5 rounded-lg border p-1';

export function MapControls() {
  const theme = useStore((s) => s.settings.theme);
  const userLocation = useStore((s) => s.userLocation);
  const { requestFly } = useStore.getState();
  const t = useT();
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    const map = getMap();
    if (!map) return;
    const on = () => setBearing(map.getBearing());
    map.on('rotate', on);
    return () => {
      map.off('rotate', on);
    };
  }, []);

  const locate = () => {
    if (userLocation) requestFly(userLocation.lon, userLocation.lat, Math.max(getMap()?.getZoom() ?? 9, 9));
    else void locateUser();
  };

  return (
    <div data-tour="controls" className="pointer-events-none absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
      <div data-tour="map-search" className={group}>
        <IconButton label={t('map.controls.search', { shortcut: PALETTE_SHORTCUT })} onClick={() => window.dispatchEvent(new Event('sondehubv2:command'))}>
          <Search size={18} />
        </IconButton>
      </div>
      <div className={group}>
        <IconButton label={t('map.controls.zoomIn')} onClick={() => getMap()?.zoomIn()}>
          <Plus size={18} />
        </IconButton>
        <IconButton label={t('map.controls.zoomOut')} onClick={() => getMap()?.zoomOut()}>
          <Minus size={18} />
        </IconButton>
        <IconButton label={t('map.controls.resetBearing')} className="hidden md:inline-flex" onClick={() => getMap()?.resetNorthPitch()}>
          <Compass size={18} style={{ transform: `rotate(${-bearing - 45}deg)` }} className="transition-transform" />
        </IconButton>
      </div>
      <div className={group}>
        <IconButton label={t('map.controls.myLocation')} active={!!userLocation} onClick={locate}>
          <LocateFixed size={18} />
        </IconButton>
        <LayerPanel />
        <IconButton label={theme === 'dark' ? t('map.controls.lightTheme') : t('map.controls.darkTheme')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
      </div>
    </div>
  );
}
