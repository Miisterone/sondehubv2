// Landing alerts: shared enable/disable API + notification permission helpers.
// The alert engine itself (store subscriptions, dedupe, delivery) lives in components/Notifiers.tsx.
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';

export type NotifPermission = NotificationPermission | 'unsupported';

/** Current system-notification permission ('unsupported' when the API is missing, e.g. iOS outside a PWA). */
export function notificationPermission(): NotifPermission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

/**
 * Asks for system-notification permission (must run from a user gesture to be honoured by
 * Firefox/Safari). Resolves to the resulting permission.
 */
export async function requestNotificationPermission(): Promise<NotifPermission> {
  const p = notificationPermission();
  if (p !== 'default') return p;
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationPermission();
  }
}

/**
 * Turns system notifications on or off from a user gesture. Turning them on asks for the
 * permission when needed; if the browser refuses, alerts stay in-app only.
 */
export async function setSystemNotifications(on: boolean): Promise<boolean> {
  const { setAlerts } = useStore.getState();
  if (!on) {
    setAlerts({ system: false });
    return false;
  }
  const perm = await requestNotificationPermission();
  if (perm === 'granted') {
    setAlerts({ system: true });
    return true;
  }
  setAlerts({ system: false });
  toast.warning(
    perm === 'unsupported' ? 'Notifications système non prises en charge par ce navigateur' : 'Notifications système bloquées par le navigateur',
    { id: 'alerts-perm', description: 'Les alertes s’afficheront uniquement dans l’application.' },
  );
  return false;
}

/**
 * Turns landing alerts on from a user gesture: gets the position, asks for notification
 * permission if needed, then enables alerts. Resolves false if the position is unavailable.
 */
export async function enableAlerts(): Promise<boolean> {
  const { settings } = useStore.getState();
  // Start the permission request synchronously, while the click still counts as a user gesture
  // (waiting for the position first can outlast the browser's activation window).
  const wantsSystem = settings.alerts.system && notificationPermission() === 'default';
  const permission = wantsSystem ? requestNotificationPermission() : null;

  const ok = await locateUser({ fly: false });
  if (!ok) return false; // locateUser already explained why in a toast

  const st = useStore.getState();
  if (permission) {
    const perm = await permission;
    if (perm !== 'granted') {
      st.setAlerts({ system: false });
      toast.warning('Notifications système refusées', {
        id: 'alerts-perm',
        description: 'Les alertes s’afficheront uniquement dans l’application.',
      });
    }
  }
  st.setAlerts({ enabled: true });
  const a = useStore.getState().settings.alerts;
  toast.success(`Alertes activées — rayon ${a.radiusKm} km`, {
    id: 'alerts',
    description: a.favourites ? 'Et pour vos sondes favorites, où qu’elles soient.' : undefined,
  });
  return true;
}

export function disableAlerts() {
  useStore.getState().setAlerts({ enabled: false });
  toast('Alertes d’atterrissage désactivées', { id: 'alerts' });
}
