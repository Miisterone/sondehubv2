import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { LaunchSite } from '@/lib/types';
import { fmtDist, relative } from '@/lib/format';
import { bearing, cardinal, distance } from '@/lib/geo';
import { fmtDay, fmtHour, siteCountry, siteLabel, upcomingLaunches } from '@/lib/sonde';
import { Icon3D } from './Icon3D';

const HORIZON_MS = 36 * 3_600_000;
const NEAR_RADIUS_M = 400_000;

interface Row {
  site: LaunchSite;
  t: number;
  d: number | null;
  b: number | null;
}

export function nextLaunches(sites: LaunchSite[], me: { lat: number; lon: number } | null, now: number, limit: number): Row[] {
  const rows: Row[] = [];
  for (const site of sites) {
    const t = upcomingLaunches(site.times, now, HORIZON_MS, 1)[0];
    if (t === undefined) continue;
    const d = me ? distance(me.lat, me.lon, site.lat, site.lon) : null;
    if (d !== null && d > NEAR_RADIUS_M) continue;
    rows.push({ site, t, d, b: me ? bearing(me.lat, me.lon, site.lat, site.lon) : null });
  }
  return rows.sort((a, b) => a.t - b.t || (a.d ?? 0) - (b.d ?? 0)).slice(0, limit);
}

export function UpcomingLaunches({ limit = 5, className }: { limit?: number; className?: string }) {
  const sites = useStore((s) => s.sites);
  const me = useStore((s) => s.userLocation);
  const units = useStore((s) => s.settings.units);
  const now = useStore((s) => s.now);
  const minute = Math.floor(now / 60_000);
  const rows = useMemo(() => nextLaunches(sites, me, minute * 60_000, limit), [sites, me, minute, limit]);
  const { selectSite } = useStore.getState();

  if (!rows.length) return null;

  return (
    <section aria-label="Prochains lâchers" className={className}>
      <h2 className="flex items-baseline gap-2 px-5 pt-5 pb-1 text-[14px] font-semibold">{me ? 'Prochains lâchers près de vous' : 'Prochains lâchers'}</h2>
      <p className="px-5 pb-2 text-[12.5px] leading-relaxed">
        {me
          ? `Stations à moins de ${fmtDist(NEAR_RADIUS_M, units)}, heure de lâcher estimée 45 min avant l’heure de mesure.`
          : 'Heure de lâcher estimée 45 min avant l’heure de mesure.'}
      </p>
      <ul>
        {rows.map((r) => (
          <li key={r.site.id} className="border-b last:border-b-0">
            <button
              type="button"
              onClick={() => selectSite(r.site.id, true)}
              className="hover:bg-surface focus-visible:ring-ring/50 flex w-full items-center gap-3 px-5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <Icon3D id="launch" size={36} className="-my-1" />
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-[14px] font-semibold">{siteLabel(r.site.name)}</span>
                <span className="block truncate text-[12.5px]">
                  {r.d !== null && r.b !== null ? `${fmtDist(r.d, units)} ${cardinal(r.b)} de vous` : (siteCountry(r.site.name) ?? 'Site de lâcher')}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular text-foreground block text-[14px] font-semibold">{relative(r.t, now)}</span>
                <span className="tabular text-faint block text-[12px]">
                  {fmtDay(r.t, now)}, {fmtHour(r.t)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
