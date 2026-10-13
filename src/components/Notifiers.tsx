import { useEffect } from 'react';
import { toast } from 'sonner';
import { BellRing, WifiOff } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';
import { usefulPrediction } from '@/lib/filter';
import { bearing, compass, distance } from '@/lib/geo';
import { fmtAlt, fmtDist, relative } from '@/lib/format';

/* ───────────────────────────── Landing alerts ───────────────────────────── */

type AlertKind = 'near' | 'close' | 'burst' | 'soon';

interface PendingAlert {
  serial: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** Sort key: lower is more urgent. */
  rank: number;
}

/** Re-evaluate at most this often: data arrives every second, alerts don't need that pace. */
const EVAL_THROTTLE_MS = 2000;
/** A favourite gets a "landing soon" alert this long before its predicted touchdown. */
const SOON_MS = 10 * 60_000;
/** Burst alerts only for bursts seen recently (avoids alerting on old flights after a reload). */
const BURST_RECENT_MS = 15 * 60_000;
/** More alerts than this in one pass are summarised in a single toast. */
const MAX_TOASTS_PER_PASS = 3;

/* Dedupe log: serial:kind → when it was sent (+ distance for proximity), kept per tab session. */
const SENT_KEY = 'sondetrack.alerts.sent.v1';
const SENT_TTL_MS = 12 * 3_600_000;
type SentLog = Record<string, { t: number; d?: number }>;
let sentLog: SentLog | null = null;

function sent(): SentLog {
  if (sentLog) return sentLog;
  sentLog = {};
  try {
    const raw = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? '{}') as SentLog;
    const cutoff = Date.now() - SENT_TTL_MS;
    for (const [k, v] of Object.entries(raw)) if (v && v.t > cutoff) sentLog[k] = v;
  } catch {
    /* corrupt or unavailable storage: start afresh */
  }
  return sentLog;
}

function markSent(serial: string, kind: AlertKind, d?: number) {
  sent()[`${serial}:${kind}`] = { t: Date.now(), d };
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify(sentLog));
  } catch {
    /* storage unavailable: dedupe still holds for this page */
  }
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** "vers 18:42 — dans 25 min" (no relative part once the predicted time is past). */
function when(ms: number, now: number) {
  return ms > now ? `vers ${clock(ms)} — ${relative(ms, now)}` : `vers ${clock(ms)}`;
}

function collectAlerts(): PendingAlert[] {
  const st = useStore.getState();
  const { alerts, favourites, units } = st.settings;
  const now = Date.now();
  const log = sent();
  const loc = st.userLocation;
  const radius = alerts.radiusKm * 1000;
  const out: PendingAlert[] = [];

  // Proximity: predicted landings inside the radius around the user.
  if (loc) {
    for (const [serial, p] of Object.entries(st.predictions)) {
      const s = st.sondes[serial];
      if (!s || (s.phase !== 'ascending' && s.phase !== 'descending') || !usefulPrediction(s, p)) continue;
      const L = p.landing!;
      const d = distance(loc.lat, loc.lon, L.lat, L.lon);
      if (d > radius) continue;
      const first = log[`${serial}:near`];
      // One alert per sonde; a second one only if it later comes much closer than first announced.
      const kind: AlertKind | null = !first ? 'near' : (first.d ?? 0) > radius / 3 && d < radius / 3 && !log[`${serial}:close`] ? 'close' : null;
      if (!kind) continue;
      const dir = compass(bearing(loc.lat, loc.lon, L.lat, L.lon));
      out.push({
        serial,
        kind,
        title: kind === 'near' ? 'Atterrissage prévu près de vous' : 'La sonde se rapproche de vous',
        body: `${serial} devrait atterrir à ${fmtDist(d, units)} (${dir}) ${when(L.time * 1000, now)}`,
        rank: d,
      });
      markSent(serial, kind, d);
    }
  }

  // Followed sondes: burst and imminent landing, wherever they are.
  if (alerts.favourites) {
    for (const serial of favourites) {
      const s = st.sondes[serial];
      if (!s || s.phase !== 'descending') continue;
      if (!log[`${serial}:burst`]) {
        const peak = s.track[s.maxAltIdx];
        // A real burst: a high peak, clearly left behind, not long ago.
        if (peak && s.maxAlt > 5000 && s.maxAlt - s.last.alt > 300 && now - peak[3] < BURST_RECENT_MS) {
          out.push({
            serial,
            kind: 'burst',
            title: 'Éclatement d’une sonde suivie',
            body: `${serial} a éclaté à ${fmtAlt(s.maxAlt, units)}, descente en cours`,
            rank: -1,
          });
          markSent(serial, 'burst');
        }
      }
      const p = st.predictions[serial];
      if (!log[`${serial}:soon`] && usefulPrediction(s, p)) {
        const t = p.landing!.time * 1000;
        if (t - now <= SOON_MS && t - now > -60_000) {
          const where = loc
            ? ` à ${fmtDist(distance(loc.lat, loc.lon, p.landing!.lat, p.landing!.lon), units)} (${compass(bearing(loc.lat, loc.lon, p.landing!.lat, p.landing!.lon))}) de vous`
            : '';
          out.push({
            serial,
            kind: 'soon',
            title: 'Atterrissage imminent',
            body: `${serial} devrait atterrir${where} ${when(t, now)}`,
            rank: -2,
          });
          markSent(serial, 'soon');
        }
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function viewSonde(serial: string) {
  useStore.getState().select(serial, true);
}

/**
 * System notifications only when the user is not looking at the page (tab hidden or window
 * unfocused): otherwise the in-app toast already says it, and a second OS banner is noise.
 */
function systemNotify(a: PendingAlert) {
  if (!useStore.getState().settings.alerts.system) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden && document.hasFocus()) return;
  try {
    const n = new Notification(a.title, { body: a.body, tag: `${a.serial}:${a.kind}`, icon: '/favicon.svg' });
    n.onclick = () => {
      window.focus();
      viewSonde(a.serial);
      n.close();
    };
  } catch {
    /* e.g. Android Chrome only allows notifications from a service worker: the toast remains */
  }
}

function deliver(list: PendingAlert[]) {
  const shown = list.length > MAX_TOASTS_PER_PASS ? list.slice(0, MAX_TOASTS_PER_PASS - 1) : list;
  for (const a of shown) {
    toast(a.title, {
      id: `alert:${a.serial}:${a.kind}`,
      description: a.body,
      icon: <BellRing className="text-foreground size-4" />,
      duration: 30_000,
      closeButton: true,
      action: { label: 'Voir', onClick: () => viewSonde(a.serial) },
    });
    systemNotify(a);
  }
  const rest = list.length - shown.length;
  if (rest > 0) {
    const body = `${rest} autres sondes devraient atterrir près de vous ou sont suivies`;
    toast('Autres alertes d’atterrissage', { id: 'alert:more', description: body, icon: <BellRing className="text-foreground size-4" />, duration: 30_000, closeButton: true });
    for (const a of list.slice(shown.length)) systemNotify(a);
  }
}

function useLandingAlerts() {
  useEffect(() => {
    let timer: number | undefined;
    const run = () => {
      timer = undefined;
      if (!useStore.getState().settings.alerts.enabled) return;
      const list = collectAlerts();
      if (list.length) deliver(list);
    };
    const unsub = useStore.subscribe((s, prev) => {
      // Cheap gate: nothing to do while alerts are off, or when unrelated state changed.
      if (!s.settings.alerts.enabled || timer !== undefined) return;
      if (
        s.sondes === prev.sondes &&
        s.predictions === prev.predictions &&
        s.userLocation === prev.userLocation &&
        s.settings.alerts === prev.settings.alerts &&
        s.settings.favourites === prev.settings.favourites
      )
        return;
      timer = window.setTimeout(run, EVAL_THROTTLE_MS);
    });

    // Alerts left on from a previous visit need the position again after a reload. Only ask
    // silently if the permission is already granted; otherwise offer a button (a prompt out of
    // the blue would be rude and is often blocked without a user gesture).
    const st = useStore.getState();
    if (st.settings.alerts.enabled && !st.userLocation) {
      const locateQuietly = () => locateUser({ fly: false, silent: true });
      const offer = () =>
        toast('Alertes d’atterrissage en pause', {
          id: 'alerts-geo',
          description: 'Votre position est nécessaire pour les sondes qui atterrissent près de vous.',
          icon: <BellRing className="text-foreground size-4" />,
          duration: 15_000,
          action: { label: 'Me localiser', onClick: () => void locateUser({ fly: false }) },
        });
      const perms = navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (!perms) offer();
      else
        perms.then(
          (p) => {
            if (useStore.getState().userLocation) return;
            if (p.state === 'granted') {
              void locateQuietly();
            } else offer();
          },
          offer,
        );
    }
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);
}

/* ─────────────────────────── Connection notices ─────────────────────────── */

/** How long the live feed may be down before saying so (short blips stay silent). */
const LOST_AFTER_MS = 5000;
/** At page load the first connection gets more slack before we complain. */
const FIRST_CONNECT_MS = 20_000;

function useConnectionNotices() {
  useEffect(() => {
    let everLive = useStore.getState().conn === 'live';
    let shown: null | 'offline' | 'lost' = null;
    let timer: number | undefined;
    const icon = <WifiOff className="size-4" />;

    const showLost = () => {
      shown = 'lost';
      toast.loading(everLive ? 'Connexion temps réel perdue — reconnexion…' : 'Connexion au flux temps réel impossible — nouvel essai…', {
        id: 'conn',
        description: 'Les positions affichées peuvent être en retard.',
        duration: Infinity,
      });
    };

    const update = () => {
      const live = useStore.getState().conn === 'live';
      if (!navigator.onLine) {
        window.clearTimeout(timer);
        timer = undefined;
        if (shown !== 'offline') {
          shown = 'offline';
          toast('Vous êtes hors ligne', { id: 'conn', icon, description: 'Les données reprendront au retour du réseau.', duration: Infinity });
        }
        return;
      }
      if (live) {
        window.clearTimeout(timer);
        timer = undefined;
        everLive = true;
        if (shown) toast.success(shown === 'offline' ? 'De retour en ligne' : 'Reconnecté', { id: 'conn', description: undefined, duration: 3000 });
        shown = null;
        return;
      }
      // Online but the feed is down.
      if (shown === 'offline') return showLost(); // network is back, feed still reconnecting
      if (shown || timer !== undefined) return;
      timer = window.setTimeout(
        () => {
          timer = undefined;
          if (navigator.onLine && useStore.getState().conn !== 'live') showLost();
        },
        everLive ? LOST_AFTER_MS : FIRST_CONNECT_MS,
      );
    };

    const unsub = useStore.subscribe((s, prev) => {
      if (s.conn !== prev.conn) update();
    });
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      unsub();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.clearTimeout(timer);
    };
  }, []);
}

/** Headless: landing alerts + connection-state toasts. */
export function Notifiers() {
  useLandingAlerts();
  useConnectionNotices();
  return null;
}
