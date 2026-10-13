import { useEffect, useState } from 'react';
import { Compass, LocateFixed, Minus, Moon, Mountain, Plus, Search, Sun } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { getMap } from './MapView';
import { locateUser } from '@/lib/geolocation';
import { PALETTE_SHORTCUT } from '@/lib/platform';
import { IconButton } from './ui';
import { LayerPanel, setTheme } from './LayerPanel';

const group = 'bg-background pointer-events-auto flex flex-col gap-0.5 rounded-lg border p-1';

export function MapControls() {
  const theme = useStore((s) => s.settings.theme);
  const terrain3d = useStore((s) => s.settings.terrain3d);
  const userLocation = useStore((s) => s.userLocation);
  const { setSettings, requestFly } = useStore.getState();
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
    <div className="pointer-events-none absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
      <div className={group}>
        <IconButton label={`Rechercher (${PALETTE_SHORTCUT})`} onClick={() => window.dispatchEvent(new Event('sondehubv2:command'))}>
          <Search size={18} />
        </IconButton>
      </div>
      <div className={group}>
        <IconButton label="Zoom avant" onClick={() => getMap()?.zoomIn()}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="Zoom arrière" onClick={() => getMap()?.zoomOut()}>
          <Minus size={18} />
        </IconButton>
        <IconButton label="Réinitialiser l'orientation" className="hidden md:inline-flex" onClick={() => getMap()?.resetNorthPitch()}>
          <Compass size={18} style={{ transform: `rotate(${-bearing - 45}deg)` }} className="transition-transform" />
        </IconButton>
      </div>
      <div className={group}>
        <IconButton label="Ma position" active={!!userLocation} onClick={locate}>
          <LocateFixed size={18} />
        </IconButton>
        <LayerPanel />
        <IconButton label="Relief 3D" active={terrain3d} onClick={() => setSettings({ terrain3d: !terrain3d })}>
          <Mountain size={18} />
        </IconButton>
        <IconButton label={theme === 'dark' ? 'Thème clair' : 'Thème sombre'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
      </div>
    </div>
  );
}
