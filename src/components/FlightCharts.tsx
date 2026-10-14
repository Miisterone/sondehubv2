import { useMemo, useState } from 'react';
import type uPlot from 'uplot';
import type { AlignedData } from 'uplot';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import type { FlightData, Sounding } from '@/lib/flight';
import { sampleTimes } from '@/lib/flight';
import { fmtAlt, fmtAltShort, fmtClock, fmtDist, fmtHSpeed, fmtNum, fmtTemp, fmtVSpeed, relative, type Units } from '@/lib/format';
import { compass, towards } from '@/lib/geo';
import { Chart, axis, cursorOptions, drawDot, drawHLine, drawLabel, drawVLine, inPlot, type Annotate, type Box, type ChartTheme } from './Chart';
import { ChartLegend, LineKey, Readout } from './ChartParts';
import { Segmented, cx } from './ui';
import { Button } from '@/components/ui/button';
import { intlTag, t, useT } from '@/i18n';

type Num = number | null;

export function unitsOf(units: Units) {
  const metric = units === 'metric';
  return {
    alt: metric ? 0.001 : 0.00328084,
    altU: metric ? 'km' : 'kft',
    vv: metric ? 1 : 196.85,
    vvU: metric ? 'm/s' : 'ft/min',
    hs: metric ? 3.6 : 2.23694,
    hsU: metric ? 'km/h' : 'mph',
    dist: metric ? 0.001 : 1 / 1609.344,
    distU: metric ? 'km' : 'mi',
  };
}

const nfCache = new Map<string, Intl.NumberFormat>();
const nf = (digits: number) => {
  const key = `${intlTag()}|${digits}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intlTag(), { maximumFractionDigits: digits });
    nfCache.set(key, f);
  }
  return f;
};
const clock = (s: number) => new Date(s * 1000).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });
const timeTicks = (_: uPlot, ticks: number[]) => ticks.map(clock);
const scaled = (arr: Num[], k: number) => arr.map((v) => (v === null ? null : v * k));
const unitTicks = (unit: string, digits = 0) => (_: uPlot, ticks: number[]) => ticks.map((v) => `${nf(digits).format(v)} ${unit}`);
const signedTicks = (unit: string) => (_: uPlot, ticks: number[]) =>
  ticks.map((v) => `${v > 0 ? '+' : ''}${nf(0).format(v)} ${unit}`);

function pick(d: FlightData, measured: Num[], forecast: Num[], i: number): { v: number | null; predicted: boolean } {
  if (i <= d.last) return { v: measured[i], predicted: false };
  return { v: forecast[i], predicted: true };
}

function safeIndex(d: FlightData, idx: number | null) {
  if (idx === null || idx < 0 || idx >= d.x.length) return Math.max(0, d.last);
  return idx;
}

function niceMax(max: number, steps = [1, 2, 2.5, 5, 10]) {
  if (!(max > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const s of steps) if (max <= s * mag) return s * mag;
  return 10 * mag;
}

function when(d: FlightData, i: number, now: number, live: boolean, kind: 'altitude' | 'speed') {
  const ts = d.x[i];
  if (i > d.last) return t(kind === 'altitude' ? 'charts.altitude.predictedAt' : 'charts.speed.predictedAt', { time: clock(ts), relative: relative(ts * 1000, now) });
  if (i === d.last && live) return t('charts.when.measuredLive', { time: fmtClock(ts * 1000) });
  return t('charts.when.measured', { time: fmtClock(ts * 1000) });
}

function markCurrent(u: uPlot, th: ChartTheme, d: FlightData, ys: Num[], k: number, boxes: Box[], label?: string) {
  if (d.last < 0) return;
  const v = ys[d.last];
  if (v === null) return;
  const x = u.valToPos(d.x[d.last], 'x', true);
  const y = u.valToPos(v * k, 'y', true);
  if (!inPlot(u, x, y)) return;
  drawDot(u, x, y, th.accent, th.surface, 4);
  boxes.push({ x: x - 8, y: y - 8, w: 16, h: 16 });
  if (label) {
    const b = drawLabel(u, th, x, y, label, { prefer: 'left', avoid: boxes });
    if (b) boxes.push(b);
  }
}

function nowLine(u: uPlot, th: ChartTheme, d: FlightData) {
  if (d.forecast) drawVLine(u, u.valToPos(d.x[d.last], 'x', true), th.zero);
}

function markNow(u: uPlot, th: ChartTheme, d: FlightData, live: boolean, boxes: Box[]) {
  if (!d.forecast) return;
  const x = u.valToPos(d.x[d.last], 'x', true);
  const text = live ? t('charts.marker.now') : t('charts.marker.lastSignal');
  const b =
    drawLabel(u, th, x, u.bbox.top + u.bbox.height, text, { prefer: 'right', weight: 400, avoid: boxes }) ??
    drawLabel(u, th, x, u.bbox.top, text, { prefer: 'right', above: false, weight: 400, avoid: boxes });
  if (b) boxes.push(b);
}

export function AltitudeChart({ d, units, now, live, syncKey }: { d: FlightData; units: Units; now: number; live: boolean; syncKey: string }) {
  const t = useT();
  const [idx, setIdx] = useState<number | null>(null);
  const u = unitsOf(units);
  const data = useMemo<AlignedData>(() => [d.x, scaled(d.alt, u.alt), scaled(d.altP, u.alt)], [d, u.alt]);
  const i = safeIndex(d, idx);
  const cur = pick(d, d.alt, d.altP, i);
  const vv = pick(d, d.vv, d.vvP, i).v;
  const hs = pick(d, d.hs, d.hsP, i).v;
  const hdg = d.hdg[i];

  const annotate: Annotate = (pl, th) => {
    const boxes: Box[] = [];
    nowLine(pl, th, d);
    markCurrent(pl, th, d, d.alt, u.alt, boxes);
    if (d.burst !== null) {
      const v = d.alt[d.burst];
      if (v !== null) {
        const x = pl.valToPos(d.x[d.burst], 'x', true);
        const y = pl.valToPos(v * u.alt, 'y', true);
        drawDot(pl, x, y, th.ink, th.surface, 3.5);
        const b = drawLabel(pl, th, x, y, t('charts.altitude.burstAt', { alt: fmtAltShort(v, units) }), { prefer: 'right', avoid: boxes });
        if (b) boxes.push(b);
      }
    }
    if (d.burstP !== null) {
      const v = d.altP[d.burstP];
      if (v !== null) {
        const x = pl.valToPos(d.x[d.burstP], 'x', true);
        const y = pl.valToPos(v * u.alt, 'y', true);
        drawDot(pl, x, y, th.pred, th.surface, 3.5, true);
        const b = drawLabel(pl, th, x, y, t('charts.altitude.burstPredictedAt', { alt: fmtAltShort(v, units) }), { prefer: 'right', avoid: boxes });
        if (b) boxes.push(b);
      }
    }
    if (d.landingP !== null) {
      const x = pl.valToPos(d.x[d.landingP], 'x', true);
      const y = pl.valToPos((d.altP[d.landingP] ?? 0) * u.alt, 'y', true);
      drawDot(pl, x, y, th.pred, th.surface, 3.5, true);
      const b = drawLabel(pl, th, x, y, t('charts.altitude.landingAt', { time: clock(d.x[d.landingP]) }), { prefer: 'left', avoid: boxes });
      if (b) boxes.push(b);
    }
    markNow(pl, th, d, live, boxes);
  };

  const makeOptions = (th: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(th, syncKey),
    scales: {
      x: { time: true },
      y: { range: (_: uPlot, _min: number, max: number): uPlot.Range.MinMax => [0, niceMax(max * 1.08)] },
    },
    axes: [axis(th, { values: timeTicks, space: 64 }), axis(th, { values: unitTicks(u.altU), size: 52, space: 36 })],
    series: [
      {},
      { label: t('charts.common.altitudeMeasured'), stroke: th.accent, width: 2, fill: th.accentFill, points: { show: false } },
      { label: t('charts.common.altitudePredicted'), stroke: th.pred, width: 2, dash: [6, 4], points: { show: false } },
    ],
  });

  return (
    <div className="space-y-3">
      <Readout
        value={fmtAlt(cur.v ?? undefined, units)}
        caption={
          <>
            <LineKey predicted={cur.predicted} />
            <span className="truncate">{when(d, i, now, live, 'altitude')}</span>
          </>
        }
        aside={
          <>
            <div className="text-foreground flex items-center justify-end gap-1 font-semibold">
              {vv !== null && (vv >= 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
              {fmtVSpeed(vv ?? undefined, units)}
            </div>
            <div>
              {hdg !== null && hs !== null
                ? t('charts.altitude.speedTowards', { speed: fmtHSpeed(hs ?? undefined, units), direction: compass(hdg) })
                : fmtHSpeed(hs ?? undefined, units)}
            </div>
          </>
        }
      />
      <Chart
        key={units}
        data={data}
        makeOptions={makeOptions}
        annotate={annotate}
        onIndex={setIdx}
        height={210}
        label={d.forecast ? t('charts.altitude.chartLabelForecast') : t('charts.altitude.chartLabel')}
      />
      <ChartLegend forecast={d.forecast} />
    </div>
  );
}

type SpeedMode = 'vertical' | 'horizontal';

export function SpeedChart({ d, units, now, live, syncKey }: { d: FlightData; units: Units; now: number; live: boolean; syncKey: string }) {
  const t = useT();
  const [mode, setMode] = useState<SpeedMode>('vertical');
  const [idx, setIdx] = useState<number | null>(null);
  const u = unitsOf(units);
  const vertical = mode === 'vertical';
  const k = vertical ? u.vv : u.hs;
  const unit = vertical ? u.vvU : u.hsU;
  const measured = vertical ? d.vv : d.hs;
  const forecast = vertical ? d.vvP : d.hsP;
  const data = useMemo<AlignedData>(() => [d.x, scaled(measured, k), scaled(forecast, k)], [d, measured, forecast, k]);
  const i = safeIndex(d, idx);
  const cur = pick(d, measured, forecast, i);
  const alt = pick(d, d.alt, d.altP, i).v;
  const hdg = d.hdg[i];

  const extreme = useMemo(() => {
    let best = -1;
    for (let j = 0; j <= d.last; j++) {
      const v = measured[j];
      if (v === null) continue;
      if (best < 0 || (vertical ? v < (measured[best] as number) : v > (measured[best] as number))) best = j;
    }
    if (best < 0) return null;
    const v = measured[best] as number;
    if (vertical ? v > -3 : v < 1) return null;
    return best;
  }, [d, measured, vertical]);

  const annotate: Annotate = (pl, th) => {
    const boxes: Box[] = [];
    if (vertical) drawHLine(pl, pl.valToPos(0, 'y', true), th.zero);
    nowLine(pl, th, d);
    markCurrent(pl, th, d, measured, k, boxes);
    if (extreme !== null) {
      const v = measured[extreme] as number;
      const x = pl.valToPos(d.x[extreme], 'x', true);
      const y = pl.valToPos(v * k, 'y', true);
      drawDot(pl, x, y, th.ink, th.surface, 3);
      const text = vertical ? t('charts.speed.maxFall', { value: fmtVSpeed(v, units) }) : t('charts.common.max', { value: fmtHSpeed(v, units) });
      const b = drawLabel(pl, th, x, y, text, { prefer: 'right', above: !vertical, avoid: boxes });
      if (b) boxes.push(b);
    }
    markNow(pl, th, d, live, boxes);
  };

  const makeOptions = (th: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(th, syncKey),
    scales: {
      x: { time: true },
      y: {
        range: (_: uPlot, min: number, max: number): uPlot.Range.MinMax =>
          vertical ? [-niceMax(Math.max(2, -Math.min(0, min)) * 1.1), niceMax(Math.max(2, max) * 1.15)] : [0, niceMax(Math.max(5, max) * 1.1)],
      },
    },
    axes: [axis(th, { values: timeTicks, space: 64 }), axis(th, { values: vertical ? signedTicks(unit) : unitTicks(unit), size: vertical ? 64 : 58, space: 30 })],
    series: [
      {},
      { label: vertical ? t('charts.speed.verticalMeasured') : t('charts.speed.horizontalMeasured'), stroke: th.accent, width: 2, points: { show: false } },
      { label: t('charts.speed.predicted'), stroke: th.pred, width: 2, dash: [6, 4], points: { show: false } },
    ],
  });

  const value = vertical ? fmtVSpeed(cur.v ?? undefined, units) : fmtHSpeed(cur.v ?? undefined, units);

  return (
    <div className="space-y-3">
      <Segmented<SpeedMode>
        size="sm"
        value={mode}
        onChange={setMode}
        className="w-full [&>*]:flex-1"
        options={[
          { value: 'vertical', label: t('charts.speed.vertical'), title: t('charts.speed.verticalTitle') },
          { value: 'horizontal', label: t('charts.speed.horizontal'), title: t('charts.speed.horizontalTitle') },
        ]}
      />
      <Readout
        value={
          <span className="flex items-center gap-1">
            {vertical && cur.v !== null && (cur.v >= 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />)}
            {value}
          </span>
        }
        caption={
          <>
            <LineKey predicted={cur.predicted} />
            <span className="truncate">{when(d, i, now, live, 'speed')}</span>
          </>
        }
        aside={
          <>
            <div className="text-foreground font-semibold">{alt !== null ? t('charts.common.atAlt', { alt: fmtAltShort(alt, units) }) : '—'}</div>
            <div>{!vertical && hdg !== null && cur.v !== null ? t('charts.speed.towards', { direction: towards(hdg) }) : t('charts.speed.ofAltitude')}</div>
          </>
        }
      />
      <Chart
        key={`${mode}-${units}`}
        data={data}
        makeOptions={makeOptions}
        annotate={annotate}
        onIndex={setIdx}
        height={170}
        label={vertical ? t('charts.speed.verticalChartLabel') : t('charts.speed.horizontalChartLabel')}
      />
      <ChartLegend forecast={d.forecast} />
      {vertical && <p className="text-[12px]">{t('charts.speed.verticalNote')}</p>}
    </div>
  );
}

export function ProfileChart({ d, units, now, live }: { d: FlightData; units: Units; now: number; live: boolean }) {
  const t = useT();
  const [idx, setIdx] = useState<number | null>(null);
  const u = unitsOf(units);
  const data = useMemo<AlignedData>(() => [d.path.map((v) => v * u.dist), scaled(d.alt, u.alt), scaled(d.altP, u.alt)], [d, u.alt, u.dist]);
  const i = safeIndex(d, idx);
  const cur = pick(d, d.alt, d.altP, i);

  const annotate: Annotate = (pl, th) => {
    const boxes: Box[] = [];
    const at = (j: number, v: number) => [pl.valToPos(d.path[j] * u.dist, 'x', true), pl.valToPos(v * u.alt, 'y', true)] as const;
    if (d.last >= 0 && d.alt[d.last] !== null) {
      const [x, y] = at(d.last, d.alt[d.last] as number);
      drawDot(pl, x, y, th.accent, th.surface, 4);
      boxes.push({ x: x - 8, y: y - 8, w: 16, h: 16 });
    }
    const burst = d.burst ?? d.burstP;
    if (burst !== null) {
      const v = (burst <= d.last ? d.alt[burst] : d.altP[burst]) as number | null;
      if (v !== null) {
        const [x, y] = at(burst, v);
        drawDot(pl, x, y, burst <= d.last ? th.ink : th.pred, th.surface, 3.5, burst > d.last);
        const b = drawLabel(pl, th, x, y, burst <= d.last ? t('charts.common.burst') : t('charts.common.burstPredicted'), { prefer: 'right', avoid: boxes });
        if (b) boxes.push(b);
      }
    }
    if (d.landingP !== null) {
      const [x, y] = at(d.landingP, d.altP[d.landingP] ?? 0);
      drawDot(pl, x, y, th.pred, th.surface, 3.5, true);
      const b = drawLabel(pl, th, x, y, t('charts.common.landing'), { prefer: 'left', avoid: boxes });
      if (b) boxes.push(b);
    }
  };

  const makeOptions = (th: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(th),
    scales: {
      x: { time: false },
      y: { range: (_: uPlot, _min: number, max: number): uPlot.Range.MinMax => [0, niceMax(max * 1.08)] },
    },
    axes: [axis(th, { values: unitTicks(u.distU), space: 56 }), axis(th, { values: unitTicks(u.altU), size: 52, space: 36 })],
    series: [
      {},
      { label: t('charts.common.altitudeMeasured'), stroke: th.accent, width: 2, fill: th.accentFill, points: { show: false } },
      { label: t('charts.common.altitudePredicted'), stroke: th.pred, width: 2, dash: [6, 4], points: { show: false } },
    ],
  });

  return (
    <div className="space-y-3">
      <Readout
        value={fmtAlt(cur.v ?? undefined, units)}
        caption={
          <>
            <LineKey predicted={cur.predicted} />
            <span className="truncate">{t('charts.profile.afterDistance', { distance: fmtDist(d.path[i], units) })}</span>
          </>
        }
        aside={
          <>
            <div className="text-foreground font-semibold">{i > d.last ? t('charts.profile.predictedAt', { time: clock(d.x[i]) }) : fmtClock(d.x[i] * 1000).slice(0, 5)}</div>
            <div>{i > d.last ? relative(d.x[i] * 1000, now) : i === d.last && live ? t('charts.common.live') : t('charts.profile.measured')}</div>
          </>
        }
      />
      <Chart
        key={units}
        data={data}
        makeOptions={makeOptions}
        annotate={annotate}
        onIndex={setIdx}
        height={190}
        label={t('charts.profile.chartLabel')}
      />
      <ChartLegend forecast={d.forecast} />
    </div>
  );
}

export function SoundingCharts({ s, units, syncKey }: { s: Sounding; units: Units; syncKey: string }) {
  const t = useT();
  const [idx, setIdx] = useState<number | null>(null);
  const u = unitsOf(units);
  const metric = units === 'metric';
  const x = useMemo(() => s.alt.map((v) => v * u.alt), [s, u.alt]);
  const tData = useMemo<AlignedData>(() => [x, s.temp.map((v) => (v === null ? null : metric ? v : v * 1.8 + 32))], [x, s, metric]);
  const hData = useMemo<AlignedData>(() => [x, s.hum], [x, s]);
  const last = s.alt.length - 1;
  const i = idx === null || idx > last ? last : idx;
  const hasT = s.temp.some((v) => v !== null);
  const hasH = s.hum.some((v) => v !== null);

  const extremes = useMemo(() => {
    let tMin = -1;
    let hMax = -1;
    s.temp.forEach((v, j) => {
      if (v !== null && (tMin < 0 || v < (s.temp[tMin] as number))) tMin = j;
    });
    s.hum.forEach((v, j) => {
      if (v !== null && (hMax < 0 || v > (s.hum[hMax] as number))) hMax = j;
    });
    return { tMin, hMax };
  }, [s]);

  const opts = (unit: string, range: ((u: uPlot, min: number, max: number) => uPlot.Range.MinMax) | undefined, name: string) => (th: ChartTheme) => ({
    legend: { show: false },
    cursor: cursorOptions(th, syncKey),
    scales: { x: { time: false }, y: range ? { range } : { auto: true } },
    axes: [axis(th, { values: unitTicks(u.altU), space: 56 }), axis(th, { values: unitTicks(unit), size: 52, space: 28 })],
    series: [{}, { label: name, stroke: th.accent, width: 2, points: { show: false }, spanGaps: true }],
  });

  const tAnnotate: Annotate = (pl, th) => {
    if (extremes.tMin < 0) return;
    const v = tData[1][extremes.tMin] as number;
    const px = pl.valToPos(x[extremes.tMin], 'x', true);
    const py = pl.valToPos(v, 'y', true);
    drawDot(pl, px, py, th.ink, th.surface, 3);
    drawLabel(pl, th, px, py, t('charts.common.min', { value: fmtTemp(s.temp[extremes.tMin] as number, units) }), { prefer: 'right', above: false });
  };
  const hAnnotate: Annotate = (pl, th) => {
    if (extremes.hMax < 0) return;
    const v = s.hum[extremes.hMax] as number;
    const px = pl.valToPos(x[extremes.hMax], 'x', true);
    const py = pl.valToPos(v, 'y', true);
    drawDot(pl, px, py, th.ink, th.surface, 3);
    drawLabel(pl, th, px, py, t('charts.common.max', { value: fmtNum(v, ' %', 0) }), { prefer: 'right', above: false });
  };

  if (last < 1) return null;

  return (
    <div className="space-y-3">
      <Readout
        value={
          <span>
            {hasT ? fmtTemp(s.temp[i] ?? undefined, units) : '—'}
            {hasH && <span className="text-muted-foreground font-sans text-[15px] font-normal"> {t('charts.sounding.humidity', { value: fmtNum(s.hum[i] ?? undefined, ' %', 0) })}</span>}
          </span>
        }
        caption={<span className="truncate">{t('charts.sounding.caption', { alt: fmtAltShort(s.alt[i], units) })}</span>}
      />
      {hasT && (
        <div className="space-y-1">
          <div className="text-foreground text-[12.5px] font-semibold">{t('charts.common.temperature')}</div>
          <Chart
            key={`t-${units}`}
            data={tData}
            makeOptions={opts(metric ? '°C' : '°F', undefined, t('charts.common.temperature'))}
            annotate={tAnnotate}
            onIndex={setIdx}
            height={130}
            label={t('charts.sounding.temperatureChartLabel')}
          />
        </div>
      )}
      {hasH && (
        <div className="space-y-1">
          <div className="text-foreground text-[12.5px] font-semibold">{t('charts.sounding.relativeHumidity')}</div>
          <Chart
            key={`h-${units}`}
            data={hData}
            makeOptions={opts('%', () => [0, 100], t('charts.sounding.humiditySeries'))}
            annotate={hAnnotate}
            onIndex={setIdx}
            height={110}
            label={t('charts.sounding.humidityChartLabel')}
          />
        </div>
      )}
    </div>
  );
}

export function FlightTable({ d, units }: { d: FlightData; units: Units }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    if (!open || d.x.length < 2) return [];
    const span = d.x[d.x.length - 1] - d.x[0];
    const steps = [60, 120, 300, 600, 900, 1800, 3600];
    const step = steps.find((s) => span / s <= 16) ?? 3600;
    return sampleTimes(d, step);
  }, [open, d]);

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 text-[13px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown className={cx('transition-transform', open && 'rotate-180')} />
        {open ? t('charts.table.hide') : t('charts.table.show')}
      </Button>
      {open && (
        <div className="mt-2 overflow-x-auto rounded-md border">
          <table className="tabular w-full text-[12.5px]">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-2.5 py-2 font-semibold">{t('charts.table.time')}</th>
                <th className="px-2.5 py-2 text-right font-semibold">{t('charts.table.altitude')}</th>
                <th className="px-2.5 py-2 text-right font-semibold">{t('charts.table.vSpeed')}</th>
                <th className="px-2.5 py-2 text-right font-semibold">{t('charts.table.hSpeed')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((j) => {
                const p = j > d.last;
                const alt = pick(d, d.alt, d.altP, j).v;
                const vv = pick(d, d.vv, d.vvP, j).v;
                const hs = pick(d, d.hs, d.hsP, j).v;
                const tag =
                  j === d.burst
                    ? t('charts.common.burstLower')
                    : j === d.burstP
                      ? t('charts.common.burstPredictedLower')
                      : j === d.landingP
                        ? t('charts.table.landingPredicted')
                        : j === d.last
                          ? t('charts.table.lastMeasurement')
                          : p
                            ? t('charts.table.predicted')
                            : '';
                return (
                  <tr key={j} className={cx(j === d.last && 'bg-surface', p && 'text-muted-foreground')}>
                    <td className="px-2.5 py-1.5 align-top whitespace-nowrap">
                      <div className={p ? '' : 'text-foreground'}>{clock(d.x[j])}</div>
                      {tag && <div className="text-faint text-[11.5px] leading-tight">{tag}</div>}
                    </td>
                    <td className={cx('px-2.5 py-1.5 text-right align-top whitespace-nowrap', !p && 'text-foreground')}>{fmtAlt(alt ?? undefined, units)}</td>
                    <td className="px-2.5 py-1.5 text-right align-top whitespace-nowrap">{fmtVSpeed(vv ?? undefined, units)}</td>
                    <td className="px-2.5 py-1.5 text-right align-top whitespace-nowrap">{fmtHSpeed(hs ?? undefined, units)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
