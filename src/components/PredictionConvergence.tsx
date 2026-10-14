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
import { intlTag, useT } from '@/i18n';

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });

export function PredictionConvergence({ sonde, samples, units, now }: { sonde: Sonde; samples: PredictionSample[]; units: Units; now: number }) {
  const t = useT();
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
      <p className="text-[13px] leading-relaxed">{t('charts.convergence.empty')}</p>
    );
  }

  const i = idx === null || idx >= samples.length ? samples.length - 1 : idx;
  const annotate: Annotate = (pl, th) => {
    if (burstT === null) return;
    const x = pl.valToPos(burstT, 'x', true);
    if (x < pl.bbox.left || x > pl.bbox.left + pl.bbox.width) return;
    drawVLine(pl, x, th.zero, [3, 3]);
    drawEdgeLabel(pl, th, x, t('charts.common.burstLower'), 'right');
  };
  const makeOptions = (th: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(th),
    scales: { x: { time: true }, y: { range: (_: uPlot, _min: number, max: number): uPlot.Range.MinMax => [0, Math.max(1, max * 1.15)] } },
    axes: [
      axis(th, { values: (_: uPlot, ticks: number[]) => ticks.map(clock), space: 64 }),
      axis(th, { values: (_: uPlot, ticks: number[]) => ticks.map((v) => `${new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 1 }).format(v)} ${u.distU}`), size: 58, space: 28 }),
    ],
    series: [{}, { label: t('charts.convergence.errorSeries'), stroke: th.accent, width: 2, fill: th.accentFill, points: { show: samples.length < 40, size: 4 } }],
  });

  const minutes = Math.round(stats.timeShift);

  return (
    <div className="space-y-4">
      <Readout
        value={fmtDist(errs[i], units)}
        caption={<span className="truncate">{truth ? t('charts.convergence.fromLastPosition') : t('charts.convergence.fromLatest')}</span>}
        aside={
          <>
            <div className="text-foreground font-semibold">{t('charts.convergence.forecastOf', { time: clock(samples[i].at / 1000) })}</div>
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
        label={t('charts.convergence.chartLabel')}
      />
      <div className="grid grid-cols-3 gap-4">
        <Stat label={t('charts.convergence.correction')} value={fmtDist(stats.step, units)} sub={ago(stats.last.at, now)} />
        <Stat label={t('charts.convergence.drift')} value={fmtDist(stats.drift15, units)} sub={t('charts.convergence.inDuration', { duration: fmtDuration(stats.span) })} />
        <Stat
          label={t('charts.convergence.predictedTime')}
          value={Math.abs(minutes) < 1 ? t('charts.convergence.stable') : `${minutes > 0 ? '+' : '−'}${Math.abs(minutes)} min`}
          sub={t('charts.convergence.inDuration', { duration: fmtDuration(stats.span) })}
        />
      </div>
      <p className="text-[12.5px] leading-relaxed">
        {truth ? t('charts.convergence.noteTruth') : t('charts.convergence.noteLatest')} {t('charts.convergence.samples', { count: samples.length })}
      </p>
    </div>
  );
}
