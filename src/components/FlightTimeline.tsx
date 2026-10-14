import type { ReactNode } from 'react';
import type { FlightData } from '@/lib/flight';
import type { FlightPhase, Prediction } from '@/lib/types';
import { ago, fmtAltShort, fmtDuration, fmtVSpeed, relative, type Units } from '@/lib/format';
import { siteLabel, type Launch } from '@/lib/sonde';
import { cx } from './ui';
import { Icon3D, type Icon3DId } from './Icon3D';
import { intlTag, Trans, useT } from '@/i18n';

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });

export function FlightTimeline({
  d,
  phase,
  prediction,
  units,
  now,
  launch,
}: {
  d: FlightData;
  phase: FlightPhase;
  prediction: Prediction | null;
  units: Units;
  now: number;
  launch: Launch | null;
}) {
  const t = useT();
  if (d.last < 1) return null;
  const t0 = d.x[0];
  const tn = d.x[d.last];
  const burstIdx = d.burst ?? d.burstP;
  const tb = burstIdx !== null ? d.x[burstIdx] : null;
  const burstAlt = d.burst !== null ? d.alt[d.burst] : d.burstP !== null ? d.altP[d.burstP] : null;
  const ended = phase === 'landed' || phase === 'lost';
  const tl = d.landingP !== null ? d.x[d.landingP] : ended ? tn : null;
  const tEnd = tl ?? tn;
  const span = Math.max(1, tEnd - t0);
  const ascEnd = tb ?? tEnd;
  const start = launch?.estimated ? Math.min(t0, launch.t / 1000) : t0;
  const ascFrac = (ascEnd - t0) / span;
  const descFrac = tb !== null ? (tEnd - tb) / span : 0;
  const nowFrac = Math.min(1, (tn - t0) / span);
  const fill = (a: number, b: number) => {
    const w = b - a;
    if (w <= 0) return 0;
    return Math.max(0, Math.min(1, (tn - a) / w)) * 100;
  };
  const burstPredicted = d.burst === null && d.burstP !== null;
  const landingPredicted = d.landingP !== null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <span>
            <Trans
              k={tb === null && !ended ? 'sonde.timeline.ascentOngoing' : 'sonde.timeline.ascent'}
              params={{ duration: fmtDuration((ascEnd - start) * 1000) }}
              tags={{ b: (c) => <span className="text-foreground font-semibold">{c}</span> }}
            />
          </span>
          {tb !== null && (
            <span className="text-right">
              <Trans
                k={landingPredicted ? 'sonde.timeline.descentPredicted' : 'sonde.timeline.descent'}
                params={{ duration: fmtDuration((tEnd - tb) * 1000) }}
                tags={{ b: (c) => <span className="text-foreground font-semibold">{c}</span> }}
              />
            </span>
          )}
        </div>
        <div className="relative pt-1 pb-1">
          <div className="flex h-2 gap-[2px]" aria-hidden>
            <Segment grow={ascFrac} filled={fill(t0, ascEnd)} first last={tb === null} />
            {tb !== null && descFrac > 0 && <Segment grow={descFrac} filled={fill(tb, tEnd)} last />}
          </div>
          {nowFrac < 0.999 && (
            <span
              aria-hidden
              className="bg-foreground ring-background absolute top-0 h-4 w-[2px] -translate-x-1/2 rounded-full ring-2"
              style={{ left: `${nowFrac * 100}%` }}
            />
          )}
        </div>
        {nowFrac < 0.999 && (
          <div className="flex items-center gap-3 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="bg-primary inline-block h-2 w-3.5 rounded-[2px]" /> {t('sonde.timeline.elapsed')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-primary/20 inline-block h-2 w-3.5 rounded-[2px]" /> {t('sonde.timeline.upcoming')}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Event
          icon={launch?.fromGround === false && !launch?.estimated ? 'station' : 'launch'}
          label={launch?.estimated ? t('sonde.timeline.launchEstimated') : launch?.fromGround === false ? t('sonde.common.firstSignal') : t('sonde.common.launch')}
          value={clock(start)}
          sub={launch?.site ? siteLabel(launch.site) : ago(start * 1000, now)}
          muted={launch?.estimated}
        />
        <Event
          icon="burst"
          label={t('sonde.common.burst')}
          value={tb !== null ? clock(tb) : '—'}
          sub={
            tb !== null && burstAlt !== null
              ? burstPredicted
                ? t('sonde.timeline.burstPredictedAt', { alt: fmtAltShort(burstAlt, units) })
                : t('sonde.common.atAlt', { alt: fmtAltShort(burstAlt, units) })
              : t('sonde.timeline.notEstimated')
          }
          muted={burstPredicted}
        />
        <Event
          icon={landingPredicted || !ended ? 'landing' : phase === 'lost' ? 'lost' : 'landed'}
          label={landingPredicted || !ended ? t('sonde.timeline.landing') : t('sonde.timeline.lastSignal')}
          value={tl !== null ? clock(tl) : '—'}
          sub={tl !== null ? (landingPredicted && tl * 1000 > now ? relative(tl * 1000, now) : ago(tl * 1000, now)) : t('sonde.timeline.notEstimated')}
          muted={landingPredicted}
        />
      </div>

      {prediction && (
        <p className="text-[12.5px] leading-relaxed">
          {t('sonde.timeline.model', {
            ago: ago(prediction.time, now),
            ascent: fmtVSpeed(prediction.ascentRate, units).replace('+', ''),
            descent: fmtVSpeed(prediction.descentRate, units).replace('+', ''),
          })}
        </p>
      )}
    </div>
  );
}

function Segment({ grow, filled, first, last }: { grow: number; filled: number; first?: boolean; last?: boolean }) {
  return (
    <div className={cx('bg-primary/20 relative h-full min-w-[6px] overflow-hidden', first ? 'rounded-l-full' : '', last ? 'rounded-r-full' : '')} style={{ flexGrow: grow, flexBasis: 0 }}>
      <div className="bg-primary h-full" style={{ width: `${filled}%` }} />
    </div>
  );
}

function Event({ icon, label, value, sub, muted }: { icon: Icon3DId; label: string; value: ReactNode; sub: ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <Icon3D id={icon} size={44} className="mb-1.5 -ml-1.5" />
      <div className="truncate text-[12px]">{label}</div>
      <div className={cx('tabular mt-0.5 truncate text-[15px] font-semibold', muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</div>
      <div className="text-faint truncate text-[12px]">{sub}</div>
    </div>
  );
}
