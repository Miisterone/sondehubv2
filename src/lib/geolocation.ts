import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';

let watchId: number | null = null;

/**
 * Starts following the user's position (shared by the map button, "Près de moi", alerts…).
 * Safe to call repeatedly: an active or pending watch is reused.
 * Resolves true once a first position is known, false if it could not be obtained.
 */
export function locateUser({ fly = true, silent = false }: { fly?: boolean; silent?: boolean } = {}): Promise<boolean> {
  const { userLocation, requestFly, setUserLocation } = useStore.getState();
  if (userLocation) {
    if (fly) requestFly(userLocation.lon, userLocation.lat, 9);
    return Promise.resolve(true);
  }
  if (!('geolocation' in navigator)) {
    toast.error(t('lib.geolocation.unavailable'), { id: 'geo' });
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    if (watchId !== null) {
      // Already waiting for a first fix: resolve when it arrives.
      const unsub = useStore.subscribe((s) => {
        if (s.userLocation) {
          unsub();
          resolve(true);
        }
      });
      return;
    }
    let first = true;
    if (!silent) toast.loading(t('lib.geolocation.searching'), { id: 'geo' });
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, alt: pos.coords.altitude ?? undefined });
        if (first) {
          first = false;
          if (!silent) toast.success(t('lib.geolocation.found'), { id: 'geo' });
          if (fly) requestFly(pos.coords.longitude, pos.coords.latitude, 9);
          resolve(true);
        }
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        if (denied || first) {
          // Stop so the next request retries from scratch.
          stopLocating();
          resolve(false);
        }
        if (!silent) toast.error(denied ? t('lib.geolocation.denied') : t('lib.geolocation.notFound'), { id: 'geo' });
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  });
}

export function stopLocating() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}
