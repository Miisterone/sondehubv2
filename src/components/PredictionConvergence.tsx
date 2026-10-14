import { useMemo, useState } from 'react';
import type uPlot from 'uplot';
import type { AlignedData } from 'uplot';
import type { PredictionSample, Sonde } from '@/lib/types';
import { ago, fmtDist, fmtDuration, type Units } from '@/lib/format';
import { distance } from '@/lib/geo';
import { Chart, axis, cursorOptions, drawEdgeLabel, drawVLine, type Annotate, type ChartTheme } from './Chart';
import { Readout } from './ChartParts';
import { unitsOf } from './FlightCharts';
import { Stat } from './ui';

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function PredictionConvergence({ sonde, samples, units, now }: { sonde: Sonde; samples: PredictionSample[]; units: Units; now: number }) {
  const [idx, setIdx] = useState<number | null>(null);
  const u = unitsOf(units);
  const ended = sonde.phase === 'landed' || sonde.phase === 'lost';
  const truth = ended && sonde.last.alt < 2500 ? { lat: sonde.last.lat, lon: sonde.last.lon } : null;
  const ref = truth ?? (samples.length ? samples[samples.length - 1] : null);
  const burstT = sonde.phase !== 'ascending' && sonde.maxAltIdx >= 0 && sonde.maxAlt - sonde.last.alt > 500 ? sonde.track[sonde.maxAltIdx]?.[3] / 1000 : null;

  const errs = useMemo(() => (ref ? samples.map((s) => distance(ref.lat, ref.lon, s.lat, s.lon)) : []), [samples, ref]);
  const data = useMemo<AlignedData>(() => [samples.map((s) => s.at / 1000), errs.map((e) => e * u.dist)], [samples, errs, u.dist]);

  const stats = useMemo(() => {
    if (samples.length < 2) return null;
    const last = samples[samples.length - 1];
    const prev = samples[samples.length - 2];
    const step = distance(prev.lat, prev.lon, last.lat, last.lon);
    const cutoff = last.at - 15 * 60_000;
    const old = [...samples].reverse().find((s) => s.at <= cutoff) ?? samples[0];
    const drift15 = distance(old.lat, old.lon, last.lat, last.lon);
    const span = last.at - old.at;
    const timeShift = (last.landingTime - old.landingTime) / 60_000;
    return { last, step, drift15, span, timeShift };
  }, [samples]);

  if (samples.length < 2 || !ref || !stats) {
    return (
      <p className="text-[13px] leading-relaxed">
        SondeHub recalcule la prévision d’atterrissage à chaque nouvelle mesure. L’historique de ces prévisions se construit tant que cette page reste ouverte : revenez
        dans quelques minutes pour voir si elle se stabilise.
      </p>
    );
  }

  const i = idx === null || idx >= samples.length ? samples.length - 1 : idx;
  const annotate: Annotate = (pl, t) => {
    if (burstT === null) return;
    const x = pl.valToPos(burstT, 'x', true);
    if (x < pl.bbox.left || x > pl.bbox.left + pl.bbox.width) return;
    drawVLine(pl, x, t.zero, [3, 3]);
    drawEdgeLabel(pl, t, x, 'éclatement', 'right');
  };
  const makeOptions = (t: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(t),
    scales: { x: { time: true }, y: { range: (_: uPlot, _min: number, max: number): uPlot.Range.MinMax => [0, Math.max(1, max * 1.15)] } },
    axes: [
      axis(t, { values: (_: uPlot, ticks: number[]) => ticks.map(clock), space: 64 }),
      axis(t, { values: (_: uPlot, ticks: number[]) => ticks.map((v) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)} ${u.distU}`), size: 58, space: 28 }),
    ],
    series: [{}, { label: 'Écart', stroke: t.accent, width: 2, fill: t.accentFill, points: { show: samples.length < 40, size: 4 } }],
  });

  const minutes = Math.round(stats.timeShift);

  return (
    <div className="space-y-4">
      <Readout
        value={fmtDist(errs[i], units)}
        caption={<span className="truncate">{truth ? 'de la dernière position reçue' : 'de la prévision la plus récente'}</span>}
        aside={
          <>
            <div className="text-foreground font-semibold">prévision de {clock(samples[i].at / 1000)}</div>
            <div>{ago(samples[i].at, now)}</div>
          </>
        }
      />
      <Chart
        key={units}
        data={data}
        makeOptions={makeOptions}
        annotate={annotate}
        onIndex={setIdx}
        height={150}
        label="Écart entre chaque prévision d’atterrissage et la référence, au fil du temps"
      />
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Correction" value={fmtDist(stats.step, units)} sub={ago(stats.last.at, now)} />
        <Stat label="Déplacement" value={fmtDist(stats.drift15, units)} sub={`en ${fmtDuration(stats.span)}`} />
        <Stat
          label="Heure prévue"
          value={Math.abs(minutes) < 1 ? 'stable' : `${minutes > 0 ? '+' : '−'}${Math.abs(minutes)} min`}
          sub={`en ${fmtDuration(stats.span)}`}
        />
      </div>
      <p className="text-[12.5px] leading-relaxed">
        {truth
          ? 'Écart entre chaque prévision et la dernière position reçue, qui reste proche du point de chute réel. '
          : 'Écart entre chaque prévision et la plus récente : une courbe qui retombe vers zéro indique une prévision qui se stabilise. '}
        {samples.length} prévisions enregistrées depuis l’ouverture de la page.
      </p>
    </div>
  );
}
