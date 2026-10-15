import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Listener, LaunchSite, PastFlight, Prediction, Recovery, ReversePrediction, SiteForecast, Sonde } from './types';
import { usefulPrediction } from './filter';
import { isGlider } from './sonde';
import { bearing, distance } from './geo';
import { mapLabel } from './text';
import { intlTag, t } from '@/i18n';

type FC<G extends LineString | Point = LineString | Point> = FeatureCollection<G>;
const fc = <G extends LineString | Point>(features: Feature<G>[]): FC<G> => ({ type: 'FeatureCollection', features });
const pt = (lon: number, lat: number, properties: Record<string, unknown>): Feature<Point> => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties,
});
const line = (coordinates: number[][], properties: Record<string, unknown>): Feature<LineString> => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties,
});

export const EMPTY: FC = fc([]);

const isFlying = (s: Sonde) => s.phase === 'ascending' || s.phase === 'descending';

/** Change token for a background track: rebuilt only when a point is added or the phase changes. */
export function trackDeps(s: Sonde): unknown[] {
  return [s.track.length, s.track[s.track.length - 1]?.[3], s.phase];
}

export function trackFeature(s: Sonde): Feature<LineString> {
  return line(
    s.track.map((p) => [p[0], p[1]]),
    { serial: s.serial, phase: s.phase },
  );
}

export function sondeFeature(s: Sonde, selected: boolean): Feature<Point> {
  const flying = isFlying(s);
  const h = s.last.heading;
  // Only draw a heading chevron when the sonde actually drifts.
  const showHeading = flying && h !== undefined && Number.isFinite(h) && (s.last.vel_h ?? 0) > 1.5;
  return pt(s.last.lon, s.last.lat, {
    serial: s.serial,
    phase: s.phase,
    icon: `sonde-${s.phase}`,
    alt: Math.round(s.last.alt),
    selected,
    // Flying sondes (and the selected one) are always drawn as full icons; ground ones collapse to dots.
    air: flying || selected,
    heading: showHeading ? h : -1,
    sortKey: selected ? 1e6 : s.last.alt,
  });
}

/** The selected track is split into short segments carrying their altitude, for the altitude colour ramp. */
export function selectedTrackFC(s: Sonde | undefined): FC<LineString> {
  if (!s || s.track.length < 2) return fc([]);
  const out: Feature<LineString>[] = [];
  const t = s.track;
  // Merge consecutive points into segments of ~150 m of climb to keep feature count reasonable.
  let start = 0;
  for (let i = 1; i < t.length; i++) {
    const last = i === t.length - 1;
    if (Math.abs(t[i][2] - t[start][2]) >= 150 || i - start >= 20 || last) {
      const coords = t.slice(start, i + 1).map((p) => [p[0], p[1]]);
      out.push(line(coords, { serial: s.serial, alt: (t[start][2] + t[i][2]) / 2, t0: t[start][3] / 1000 }));
      start = i;
    }
  }
  return fc(out);
}

export function predictionPathsFC(
  predictions: Record<string, Prediction>,
  sondes: Record<string, Sonde>,
  selected: string | null,
  all: boolean,
): FC<LineString> {
  const out: Feature<LineString>[] = [];
  for (const p of Object.values(predictions)) {
    const isSel = p.serial === selected;
    if (!isSel && !all) continue;
    const s = sondes[p.serial];
    if (!usefulPrediction(s, p) || p.path.length < 2) continue;
    out.push(line(p.path.map((q) => [q.lon, q.lat]), { serial: p.serial, selected: isSel }));
  }
  return fc(out);
}

export function predictionPointsFC(
  predictions: Record<string, Prediction>,
  sondes: Record<string, Sonde>,
  selected: string | null,
  showAllLandings: boolean,
): FC<Point> {
  const out: Feature<Point>[] = [];
  for (const p of Object.values(predictions)) {
    const s = sondes[p.serial];
    if (!usefulPrediction(s, p)) continue;
    const isSel = p.serial === selected;
    if (p.landing && (isSel || showAllLandings)) {
      out.push(pt(p.landing.lon, p.landing.lat, { serial: p.serial, kind: 'landing', selected: isSel }));
    }
    if (isSel && p.burst && s!.phase === 'ascending') {
      out.push(pt(p.burst.lon, p.burst.lat, { serial: p.serial, kind: 'burst', selected: true }));
    }
  }
  return fc(out);
}

/** Actual burst point of the selected sonde, once it is descending. */
export function burstFC(s: Sonde | undefined): FC<Point> {
  if (!s || s.phase === 'ascending' || s.maxAltIdx < 0 || s.maxAltIdx >= s.track.length - 1) return fc([]);
  const p = s.track[s.maxAltIdx];
  if (s.maxAlt - s.last.alt < 500) return fc([]);
  return fc([pt(p[0], p[1], { serial: s.serial, alt: Math.round(p[2]), glider: isGlider(s) })]);
}

export function receiverLinksFC(s: Sonde | undefined, listeners: Record<string, Listener>, now: number): FC<LineString> {
  if (!s) return fc([]);
  const out: Feature<LineString>[] = [];
  for (const r of Object.values(s.receivers)) {
    if (s.lastTime - r.lastHeard > 120_000 && now - r.lastHeard > 120_000) continue;
    const pos = r.position ?? (listeners[r.callsign] ? [listeners[r.callsign].lat, listeners[r.callsign].lon] : undefined);
    if (!pos) continue;
    out.push(line([[pos[1], pos[0]], [s.last.lon, s.last.lat]], { callsign: r.callsign, snr: r.snr ?? 0 }));
  }
  return fc(out);
}

export function listenersFC(listeners: Record<string, Listener>, showFixed: boolean, showMobile: boolean, now: number): FC<Point> {
  const out: Feature<Point>[] = [];
  for (const l of Object.values(listeners)) {
    if (l.mobile ? !showMobile : !showFixed) continue;
    // Chase cars only matter while they are actually out chasing.
    if (l.mobile && now - l.lastSeen > 30 * 60_000) continue;
    out.push(pt(l.lon, l.lat, { callsign: l.callsign, label: mapLabel(l.callsign), mobile: l.mobile, icon: l.mobile ? 'chase' : 'listener' }));
  }
  return fc(out);
}

export function sitesFC(sites: LaunchSite[]): FC<Point> {
  return fc(sites.map((s) => pt(s.lon, s.lat, { id: s.id, name: s.name })));
}

export function recoveriesFC(recoveries: Record<string, Recovery>, sondes: Record<string, Sonde>): FC<Point> {
  return fc(
    Object.values(recoveries)
      // A live sonde's marker already sits where it landed.
      .filter((r) => !sondes[r.serial] || sondes[r.serial].phase === 'landed' || sondes[r.serial].phase === 'lost')
      .map((r) => pt(r.lon, r.lat, { serial: r.serial, icon: r.recovered ? 'recovery-ok' : 'recovery-ko' })),
  );
}

const normLon = (lon: number) => (lon > 180 ? lon - 360 : lon);

export function reverseFC(rev: ReversePrediction | undefined, s: Sonde | undefined): FC {
  if (!rev || !s || !s.track.length || s.track[0][2] < 3000) return fc([]);
  const out: Feature<LineString | Point>[] = [];
  const path = rev.path.filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon)).map((q) => [normLon(q.lon), q.lat]);
  if (path.length >= 2) out.push(line(path, { kind: 'path' }));
  else out.push(line([[rev.lon, rev.lat], [s.track[0][0], s.track[0][1]]], { kind: 'path' }));
  out.push(pt(rev.lon, rev.lat, { kind: 'launch', label: t('lib.map.estimatedLaunch') }));
  return fc(out);
}

const shortWhen = (ts: number) => {
  const d = new Date(ts);
  const day = d.toLocaleDateString(intlTag(), { weekday: 'short' }).replace('.', '');
  return t('lib.map.forecastWhen', { day: `${day.charAt(0).toUpperCase()}${day.slice(1)}`, h: d.getHours(), m: String(d.getMinutes()).padStart(2, '0') });
};

export function sitePathsFC(forecasts: SiteForecast[]): FC<LineString> {
  return fc(forecasts.map((f, i) => line(f.path.map((q) => [normLon(q.lon), q.lat]), { next: i === 0 })));
}

export function sitePointsFC(forecasts: SiteForecast[], past: PastFlight[]): FC<Point> {
  return fc([
    ...past.map((f) => pt(f.last.lon, f.last.lat, { kind: 'past', serial: f.serial, time: f.first.time, top: Math.round(f.top.alt), alt: Math.round(f.last.alt) })),
    ...forecasts.map((f, i) => pt(normLon(f.landing.lon), f.landing.lat, { kind: 'forecast', next: i === 0, label: shortWhen(f.launchTime) })),
  ]);
}

export function trackAt(track: Sonde['track'], tMs: number): [number, number] | null {
  const n = track.length;
  if (!n) return null;
  if (tMs <= track[0][3]) return [track[0][0], track[0][1]];
  if (tMs >= track[n - 1][3]) return [track[n - 1][0], track[n - 1][1]];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid][3] <= tMs) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const k = b[3] > a[3] ? (tMs - a[3]) / (b[3] - a[3]) : 0;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

export function trackHeading(track: Sonde['track'], tMs: number): number | null {
  const n = track.length;
  if (n < 2) return null;
  const t0 = track[0][3];
  const t1 = track[n - 1][3];
  const t = Math.max(t0, Math.min(t1, tMs));
  for (const half of [45_000, 120_000, 300_000]) {
    const a = trackAt(track, Math.max(t0, t - half));
    const b = trackAt(track, Math.min(t1, t + half));
    if (!a || !b) return null;
    if (distance(a[1], a[0], b[1], b[0]) >= 30) return bearing(a[1], a[0], b[1], b[0]);
  }
  return null;
}
