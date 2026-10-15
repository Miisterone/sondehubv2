// Landing alerts: shared enable/disable API.
// The alert engine itself (store subscriptions, dedupe, delivery) lives in components/Notifiers.tsx.
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';
import { t } from '@/i18n';

export async function enableAlerts(): Promise<boolean> {
  if (!useStore.getState().settings.watchPoint) {
    const ok = await locateUser({ fly: false });
    if (!ok) return false;
  }
  const st = useStore.getState();
  st.setAlerts({ enabled: true });
  const a = useStore.getState().settings.alerts;
  toast.success(t('lib.alerts.enabled', { radius: a.radiusKm }), {
    id: 'alerts',
    description: a.favourites ? t('lib.alerts.enabledFavourites') : undefined,
  });
  return true;
}

export function disableAlerts() {
  useStore.getState().setAlerts({ enabled: false });
  toast(t('lib.alerts.disabled'), { id: 'alerts' });
}
