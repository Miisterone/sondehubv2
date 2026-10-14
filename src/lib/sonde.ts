import type { LaunchSite, Sonde } from './types';
import { distance } from './geo';

export interface Launch {
  t: number;
  site: string | null;
  fromGround: boolean;
}

const SITE_RADIUS_M = 30_000;

export function findLaunch(sonde: Pick<Sonde, 'track'>, sites: LaunchSite[]): Launch | null {
  if (!sonde.track.length) return null;
  const [lon, lat, alt, t] = sonde.track[0];
  let best: { name: string; d: number } | null = null;
  for (const s of sites) {
    const d = distance(lat, lon, s.lat, s.lon);
    if (!best || d < best.d) best = { name: s.name, d };
  }
  return { t, site: best && best.d < SITE_RADIUS_M ? best.name : null, fromGround: alt < 3000 };
}

export function siteLabel(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

export function verticalSpeed(s: Pick<Sonde, 'last' | 'lastTime' | 'track'>): number | undefined {
  const v = s.last.vel_v;
  if (v !== undefined && Number.isFinite(v)) return v;
  const tr = s.track;
  for (let i = tr.length - 1; i >= 0; i--) {
    const dt = (s.lastTime - tr[i][3]) / 1000;
    if (dt > 120) break;
    if (dt >= 20 || i === 0) return dt >= 5 ? (s.last.alt - tr[i][2]) / dt : undefined;
  }
  return undefined;
}
