import type { ReactNode } from 'react';
import type { FlightData } from '@/lib/flight';
import type { FlightPhase, Prediction } from '@/lib/types';
import { ago, fmtAltShort, fmtDuration, fmtVSpeed, relative, type Units } from '@/lib/format';
import { cx } from './ui';

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
  launch: { site: string | null; fromGround: boolean } | null;
}) {
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
            <span className="text-foreground font-semibold">Montée</span> {fmtDuration((ascEnd - t0) * 1000)}
            {tb === null && !ended ? ' et plus' : ''}
          </span>
          {tb !== null && (
            <span className="text-right">
              <span className="text-foreground font-semibold">Descente</span> {fmtDuration((tEnd - tb) * 1000)}
              {landingPredicted ? ' prévue' : ''}
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
              <span className="bg-primary inline-block h-2 w-3.5 rounded-[2px]" /> Écoulé
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-primary/20 inline-block h-2 w-3.5 rounded-[2px]" /> À venir, selon la prévision
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Event
          label={launch?.fromGround === false ? 'Premier signal' : 'Lâcher'}
          value={clock(t0)}
          sub={launch?.site ?? ago(t0 * 1000, now)}
        />
        <Event
          label="Éclatement"
          value={tb !== null ? clock(tb) : '—'}
          sub={tb !== null && burstAlt !== null ? `${burstPredicted ? 'prévu ' : ''}à ${fmtAltShort(burstAlt, units)}` : 'pas encore estimé'}
          muted={burstPredicted}
        />
        <Event
          label={landingPredicted || !ended ? 'Atterrissage' : 'Dernier signal'}
          value={tl !== null ? clock(tl) : '—'}
          sub={tl !== null ? (landingPredicted && tl * 1000 > now ? relative(tl * 1000, now) : ago(tl * 1000, now)) : 'pas encore estimé'}
          muted={landingPredicted}
        />
      </div>

      {prediction && (
        <p className="text-[12.5px] leading-relaxed">
          Prévision du modèle Tawhiri, recalculée {ago(prediction.time, now)} avec une montée de {fmtVSpeed(prediction.ascentRate, units).replace('+', '')} et une
          descente de {fmtVSpeed(prediction.descentRate, units).replace('+', '')} près du sol.
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

function Event({ label, value, sub, muted }: { label: string; value: ReactNode; sub: ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[12px]">{label}</div>
      <div className={cx('tabular mt-0.5 truncate text-[15px] font-semibold', muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</div>
      <div className="text-faint truncate text-[12px]">{sub}</div>
    </div>
  );
}
