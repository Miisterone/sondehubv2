import { useEffect } from 'react';
import { toast } from 'sonner';
import { BellRing, WifiOff } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';
import { usefulPrediction } from '@/lib/filter';
import { bearing, compass, distance } from '@/lib/geo';
import { ago, fmtAlt, fmtDist, relative } from '@/lib/format';
import { findLaunch, siteLabel, upcomingLaunches } from '@/lib/sonde';
import { intlTag, t } from '@/i18n';
import { currentCentre } from '@/lib/watchPoint';

/* ───────────────────────────── Landing alerts ───────────────────────────── */

type AlertKind = 'near' | 'close' | 'burst' | 'soon' | 'launch' | 'planned';

interface PendingAlert {
  serial: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** Sort key: lower is more urgent. */
  rank: number;
  view: () => void;
}

/** Re-evaluate at most this often: data arrives every second, alerts don't need that pace. */
const EVAL_THROTTLE_MS = 2000;
/** A favourite gets a "landing soon" alert this long before its predicted touchdown. */
const SOON_MS = 10 * 60_000;
/** Burst alerts only for bursts seen recently (avoids alerting on old flights after a reload). */
const BURST_RECENT_MS = 15 * 60_000;
/** More alerts than this in one pass are summarised in a single toast. */
const MAX_TOASTS_PER_PASS = 3;
const LAUNCH_RECENT_MS = 30 * 60_000;
const PLANNED_LEAD_MS = 30 * 60_000;
const PLANNED_RANK = 1e12;

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

const clock = (ms: number) => new Date(ms).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });

/** "vers 18:42 — dans 25 min" (no relative part once the predicted time is past). */
function when(ms: number, now: number) {
  return ms > now ? t('map.alert.whenRelative', { time: clock(ms), relative: relative(ms, now) }) : t('map.alert.when', { time: clock(ms) });
}

function collectAlerts(): PendingAlert[] {
  const st = useStore.getState();
  const { alerts, favourites, units } = st.settings;
  const now = Date.now();
  const log = sent();
  const loc = currentCentre();
  const radius = alerts.radiusKm * 1000;
  const out: PendingAlert[] = [];

  // Proximity: predicted landings inside the radius around the user.
  if (loc && alerts.landings) {
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
        title: kind === 'near' ? t('map.alert.nearTitle') : t('map.alert.closeTitle'),
        body: t('map.alert.nearBody', { serial, dist: fmtDist(d, units), dir, when: when(L.time * 1000, now) }),
        rank: d,
        view: () => viewSonde(serial),
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
            title: t('map.alert.burstTitle'),
            body: t('map.alert.burstBody', { serial, alt: fmtAlt(s.maxAlt, units) }),
            rank: -1,
            view: () => viewSonde(serial),
          });
          markSent(serial, 'burst');
        }
      }
      const p = st.predictions[serial];
      if (!log[`${serial}:soon`] && usefulPrediction(s, p)) {
        const landingMs = p.landing!.time * 1000;
        if (landingMs - now <= SOON_MS && landingMs - now > -60_000) {
          out.push({
            serial,
            kind: 'soon',
            title: t('map.alert.soonTitle'),
            body: loc
              ? t('map.alert.soonBodyFromMe', {
                  serial,
                  dist: fmtDist(distance(loc.lat, loc.lon, p.landing!.lat, p.landing!.lon), units),
                  dir: compass(bearing(loc.lat, loc.lon, p.landing!.lat, p.landing!.lon)),
                  when: when(landingMs, now),
                })
              : t('map.alert.soonBody', { serial, when: when(landingMs, now) }),
            rank: -2,
            view: () => viewSonde(serial),
          });
          markSent(serial, 'soon');
        }
      }
    }
  }

  if (loc && alerts.launchDetected) {
    for (const s of Object.values(st.sondes)) {
      if (s.phase !== 'ascending' || log[`${s.serial}:launch`]) continue;
      const rev = st.reverse[s.serial];
      const launch = findLaunch(s, st.sites, rev);
      if (!launch || now - launch.t > LAUNCH_RECENT_MS) continue;
      const from = launch.fromGround ? { lat: s.track[0][1], lon: s.track[0][0] } : rev ? { lat: rev.lat, lon: rev.lon } : null;
      if (!from) continue;
      const d = distance(loc.lat, loc.lon, from.lat, from.lon);
      if (d > radius) continue;
      const params = { serial: s.serial, dist: fmtDist(d, units), dir: compass(bearing(loc.lat, loc.lon, from.lat, from.lon)), ago: ago(launch.t, now) };
      out.push({
        serial: s.serial,
        kind: 'launch',
        title: t('map.alert.launchTitle'),
        body: launch.site ? t('map.alert.launchBodySite', { ...params, site: siteLabel(launch.site) }) : t('map.alert.launchBody', params),
        rank: d,
        view: () => viewSonde(s.serial),
      });
      markSent(s.serial, 'launch', d);
    }
  }

  if (loc && alerts.launchPlanned) {
    for (const site of st.sites) {
      const d = distance(loc.lat, loc.lon, site.lat, site.lon);
      if (d > radius) continue;
      const at = upcomingLaunches(site.times, now, PLANNED_LEAD_MS, 1)[0];
      if (at === undefined) continue;
      const key = `${site.id}@${at}`;
      if (log[`${key}:planned`]) continue;
      out.push({
        serial: key,
        kind: 'planned',
        title: t('map.alert.plannedTitle'),
        body: t('map.alert.plannedBody', { site: siteLabel(site.name), dist: fmtDist(d, units), dir: compass(bearing(loc.lat, loc.lon, site.lat, site.lon)), when: when(at, now) }),
        rank: PLANNED_RANK + at - now,
        view: () => useStore.getState().selectSite(site.id, true),
      });
      markSent(key, 'planned');
    }
  }

  return out.sort((a, b) => a.rank - b.rank);
}

function viewSonde(serial: string) {
  useStore.getState().select(serial, true);
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
      action: { label: t('map.alert.view'), onClick: a.view },
    });
  }
  const rest = list.length - shown.length;
  if (rest > 0) {
    const body = t('map.alert.moreBody', { count: rest });
    toast(t('map.alert.moreTitle'), { id: 'alert:more', description: body, icon: <BellRing className="text-foreground size-4" />, duration: 30_000, closeButton: true });
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
        s.settings.watchPoint === prev.settings.watchPoint &&
        s.sites === prev.sites &&
        s.now === prev.now &&
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
    if (st.settings.alerts.enabled && !st.userLocation && !st.settings.watchPoint) {
      const locateQuietly = () => locateUser({ fly: false, silent: true });
      const offer = () =>
        toast(t('map.alert.pausedTitle'), {
          id: 'alerts-geo',
          description: t('map.alert.pausedBody'),
          icon: <BellRing className="text-foreground size-4" />,
          duration: 15_000,
          action: { label: t('map.alerts.locate'), onClick: () => void locateUser({ fly: false }) },
        });
      const perms = navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (!perms) offer();
      else
        perms.then(
          (p) => {
            if (useStore.getState().userLocation || useStore.getState().settings.watchPoint) return;
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
      toast.loading(everLive ? t('map.conn.lost') : t('map.conn.failed'), {
        id: 'conn',
        description: t('map.conn.lostBody'),
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
          toast(t('map.conn.offline'), { id: 'conn', icon, description: t('map.conn.offlineBody'), duration: Infinity });
        }
        return;
      }
      if (live) {
        window.clearTimeout(timer);
        timer = undefined;
        everLive = true;
        if (shown) toast.success(shown === 'offline' ? t('map.conn.backOnline') : t('map.conn.reconnected'), { id: 'conn', description: undefined, duration: 3000 });
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
