// Landing alerts: shared enable/disable API.
// The alert engine itself (store subscriptions, dedupe, delivery) lives in components/Notifiers.tsx.
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';

export async function enableAlerts(): Promise<boolean> {
  const ok = await locateUser({ fly: false });
  if (!ok) return false;
  const st = useStore.getState();
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
