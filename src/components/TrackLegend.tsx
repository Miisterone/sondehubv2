import { Map as MapIcon } from 'lucide-react';
import type { FlightPhase } from '@/lib/types';
import { ALT_BANDS, altBand, altColours } from '@/lib/altRamp';
import { COLOURS, PHASE_COLOUR, PHASE_LABEL } from '@/lib/icons';
import { fmtAltShort, type Units } from '@/lib/format';

const PHASES: FlightPhase[] = ['ascending', 'descending', 'landed', 'lost'];
const TOP = 40000;

function bandLabel(m: number, units: Units, last: boolean) {
  if (m === 0) return 'Sol';
  const v = units === 'metric' ? `${Math.round(m / 1000)} km` : `${Math.round((m * 3.28084) / 1000)} kft`;
  return last ? `${v} et +` : v;
}

function position(alt: number) {
  const n = ALT_BANDS.length;
  const i = altBand(Math.max(0, alt));
  const lo = ALT_BANDS[i];
  const hi = i < n - 1 ? ALT_BANDS[i + 1] : TOP;
  const frac = Math.min(1, Math.max(0, (alt - lo) / (hi - lo)));
  return ((i + frac) / n) * 100;
}

export function TrackLegend({
  units,
  darkBase,
  alt,
  live,
  showPrediction,
  showReverse,
}: {
  units: Units;
  darkBase: boolean;
  alt: number;
  live: boolean;
  showPrediction: boolean;
  showReverse: boolean;
}) {
  const colours = altColours(darkBase);
  const at = position(alt);
  const anchor = at < 18 ? 'left' : at > 82 ? 'right' : 'center';

  return (
    <div className="space-y-4 border-t pt-5">
      <h4 className="flex items-center gap-2 text-[14px] font-semibold">
        <MapIcon className="text-muted-foreground size-4" aria-hidden />
        Lire le tracé sur la carte
      </h4>

      <div className="space-y-2">
        <p className="text-[13px] leading-snug">
          <span className="text-foreground font-semibold">Trait plein</span> : le chemin déjà parcouru. Sa couleur donne l’altitude à chaque endroit,{' '}
          {darkBase ? 'du bleu foncé près du sol au bleu très clair en haute altitude.' : 'du bleu clair près du sol au bleu nuit en haute altitude.'}
        </p>

        <div className="pt-7" role="img" aria-label={`Échelle d’altitude par tranches de ${bandLabel(ALT_BANDS[1], units, false)}. La sonde est actuellement à ${fmtAltShort(alt, units)}.`}>
          <div className="relative">
            <div
              className="absolute bottom-full mb-1.5 flex flex-col"
              style={{
                left: `${at}%`,
                transform: anchor === 'center' ? 'translateX(-50%)' : anchor === 'right' ? 'translateX(-100%)' : undefined,
                alignItems: anchor === 'center' ? 'center' : anchor === 'right' ? 'flex-end' : 'flex-start',
              }}
            >
              <span className="tabular text-foreground text-[12px] leading-none font-semibold whitespace-nowrap">
                {live ? 'Maintenant' : 'Dernier point'} · {fmtAltShort(alt, units)}
              </span>
            </div>
            <div className="flex gap-[2px]">
              {colours.map((c) => (
                <div key={c} className="h-2.5 flex-1 first:rounded-l-[3px] last:rounded-r-[3px]" style={{ background: c }} />
              ))}
            </div>
            <span className="bg-foreground ring-background absolute -top-1 h-[18px] w-[2px] -translate-x-1/2 rounded-full ring-2" style={{ left: `${at}%` }} aria-hidden />
          </div>
          <div className="mt-1.5 flex">
            {ALT_BANDS.map((m, i) => (
              <span key={m} className="tabular text-faint flex-1 text-[11.5px]">
                {bandLabel(m, units, i === ALT_BANDS.length - 1)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {(showPrediction || showReverse) && (
        <ul className="space-y-2 text-[13px] leading-snug">
          {showPrediction && (
            <li className="flex items-start gap-3">
              <span className="mt-[9px] w-7 shrink-0 border-t-[2.5px] border-dashed" style={{ borderColor: COLOURS.landing }} aria-hidden />
              <span>
                <span className="text-foreground font-semibold">Tirets roses</span> : le trajet prévu jusqu’à l’atterrissage, recalculé chaque minute.
              </span>
            </li>
          )}
          {showReverse && (
            <li className="flex items-start gap-3">
              <span className="border-muted-foreground mt-[9px] w-7 shrink-0 border-t-[2.5px] border-dotted" aria-hidden />
              <span>
                <span className="text-foreground font-semibold">Pointillés gris</span> : le départ estimé, avant que les stations captent la sonde.
              </span>
            </li>
          )}
        </ul>
      )}

      <div className="space-y-1.5">
        <p className="text-[13px] leading-snug">Les traits des autres ballons, plus discrets, sont colorés selon leur étape :</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {PHASES.map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full" style={{ background: PHASE_COLOUR[p] }} aria-hidden />
              {PHASE_LABEL[p]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
