import { useMemo, useState, type ReactNode } from 'react';
import type { AlignedData } from 'uplot';
import type uPlot from 'uplot';
import type { Prediction, Sonde } from '../lib/types';
import type { Units } from '../lib/format';
import { Chart, axis, type ChartTheme } from './Chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PHASE_COLOUR } from '../lib/icons';

type Tab = 'altitude' | 'profile' | 'speed';

const nn = (v: number) => (Number.isFinite(v) ? v : null);
const timeFmt = (_: uPlot, ticks: number[]) =>
  ticks.map((t) => new Date(t * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));

export function SondeCharts({ sonde, prediction, units }: { sonde: Sonde; prediction?: Prediction; units: Units }) {
  const [tab, setTab] = useState<Tab>('altitude');
  const hasProfile = sonde.track.some((p) => Number.isFinite(p[4]) || Number.isFinite(p[5]));
  const altK = units === 'metric' ? 1 / 1000 : 3.28084 / 1000;
  const altUnit = units === 'metric' ? 'km' : 'kft';

  // Altitude vs time, with the predicted remainder of the flight as a dashed series.
  const altData = useMemo<AlignedData>(() => {
    const t = sonde.track;
    const xs: number[] = [];
    const real: (number | null)[] = [];
    const pred: (number | null)[] = [];
    for (const p of t) {
      xs.push(p[3] / 1000);
      real.push(p[2] * altK);
      pred.push(null);
    }
    if (prediction && sonde.phase !== 'landed' && sonde.phase !== 'lost' && t.length) {
      const lastT = t[t.length - 1][3] / 1000;
      pred[pred.length - 1] = real[real.length - 1];
      for (const q of prediction.path) {
        if (q.time <= lastT) continue;
        xs.push(q.time);
        real.push(null);
        pred.push(q.alt * altK);
      }
    }
    return [xs, real, pred];
  }, [sonde.track, sonde.track.length, sonde.phase, prediction, altK]);

  // Temperature & humidity vs altitude (ascent only, the "sounding").
  const profileData = useMemo<AlignedData>(() => {
    const t = sonde.track;
    const end = sonde.maxAltIdx >= 0 ? sonde.maxAltIdx + 1 : t.length;
    const rows = t
      .slice(0, end)
      .filter((p) => Number.isFinite(p[4]) || Number.isFinite(p[5]))
      .map((p) => [p[2] * altK, units === 'metric' ? p[4] : p[4] * 1.8 + 32, p[5]] as const)
      .sort((a, b) => a[0] - b[0]);
    // uPlot needs strictly increasing x: drop duplicate altitudes.
    const out: [number[], (number | null)[], (number | null)[]] = [[], [], []];
    let last = -Infinity;
    for (const r of rows) {
      if (r[0] <= last) continue;
      last = r[0];
      out[0].push(r[0]);
      out[1].push(nn(r[1]));
      out[2].push(nn(r[2]));
    }
    return out;
  }, [sonde.track, sonde.track.length, sonde.maxAltIdx, altK, units]);

  const speedData = useMemo<AlignedData>(() => {
    const t = sonde.track;
    const xs: number[] = [];
    const vv: (number | null)[] = [];
    for (let i = 0; i < t.length; i++) {
      xs.push(t[i][3] / 1000);
      let v = t[i][6];
      if (!Number.isFinite(v) && i > 0) {
        const dt = (t[i][3] - t[i - 1][3]) / 1000;
        v = dt > 0 ? (t[i][2] - t[i - 1][2]) / dt : NaN;
      }
      vv.push(nn(units === 'metric' ? v : v * 196.85));
    }
    return [xs, vv];
  }, [sonde.track, sonde.track.length, units]);

  const altOpts = (th: ChartTheme) => ({
    legend: { show: false },
    cursor: { points: { size: 6 } },
    scales: { x: { time: true } },
    axes: [axis(th, { values: timeFmt, space: 60 }), axis(th, { label: altUnit, labelSize: 14, labelFont: '10.5px Inter Variable', size: 44 })],
    series: [
      {},
      { label: 'Altitude', stroke: '#818cf8', width: 2, fill: 'rgba(129,140,248,0.12)', points: { show: false } },
      { label: 'Prédiction', stroke: '#fb7185', width: 1.6, dash: [5, 4], points: { show: false } },
    ],
  });

  const profileOpts = (th: ChartTheme) => ({
    legend: { show: false },
    scales: { x: { time: false }, t: { auto: true }, h: { range: [0, 100] as [number, number] } },
    axes: [
      axis(th, { label: `Altitude (${altUnit})`, labelSize: 14, labelFont: '10.5px Inter Variable', size: 34 }),
      axis(th, { scale: 't', label: units === 'metric' ? '°C' : '°F', labelSize: 14, labelFont: '10.5px Inter Variable', size: 44 }),
      axis(th, { scale: 'h', side: 1, label: '% HR', labelSize: 14, labelFont: '10.5px Inter Variable', size: 40, grid: { show: false } }),
    ],
    series: [
      {},
      { label: 'Température', scale: 't', stroke: '#fb923c', width: 1.8, points: { show: false }, spanGaps: true },
      { label: 'Humidité', scale: 'h', stroke: '#38bdf8', width: 1.5, points: { show: false }, spanGaps: true },
    ],
  });

  const speedOpts = (th: ChartTheme) => ({
    legend: { show: false },
    scales: { x: { time: true } },
    axes: [axis(th, { values: timeFmt, space: 60 }), axis(th, { label: units === 'metric' ? 'm/s' : 'ft/min', labelSize: 14, labelFont: '10.5px Inter Variable', size: 44 })],
    series: [{}, { label: 'Vitesse verticale', stroke: PHASE_COLOUR.descending, width: 1.6, points: { show: false }, spanGaps: true }],
  });

  // Radix unmounts inactive tab panels, so each chart is (re)created while visible and sized to its container.
  const value = tab === 'profile' && !hasProfile ? 'altitude' : tab;

  return (
    <Tabs value={value} onValueChange={(v) => setTab(v as Tab)} className="gap-2">
      <TabsList className="h-8! w-full">
        <TabsTrigger value="altitude" className="text-[11.5px]">
          Altitude
        </TabsTrigger>
        {hasProfile && (
          <TabsTrigger value="profile" className="text-[11.5px]">
            Sondage T° / HR
          </TabsTrigger>
        )}
        <TabsTrigger value="speed" className="text-[11.5px]">
          Vitesse vert.
        </TabsTrigger>
      </TabsList>
      <TabsContent value="altitude" className="bg-chip rounded-xl p-2">
        <Chart data={altData} makeOptions={altOpts} />
        <Legend
          items={[
            { label: 'Mesurée', swatch: <span className="h-0.5 w-4 rounded bg-[#818cf8]" /> },
            ...(prediction && sonde.phase !== 'landed' ? [{ label: 'Prédiction', swatch: <span className="h-0 w-4 border-t-2 border-dashed border-[#fb7185]" /> }] : []),
          ]}
        />
      </TabsContent>
      {hasProfile && (
        <TabsContent value="profile" className="bg-chip rounded-xl p-2">
          <Chart data={profileData} makeOptions={profileOpts} />
          <Legend
            items={[
              { label: 'Température', swatch: <span className="h-0.5 w-4 rounded bg-[#fb923c]" /> },
              { label: 'Humidité relative', swatch: <span className="h-0.5 w-4 rounded bg-[#38bdf8]" /> },
            ]}
          />
        </TabsContent>
      )}
      <TabsContent value="speed" className="bg-chip rounded-xl p-2">
        <Chart data={speedData} makeOptions={speedOpts} />
        <Legend items={[{ label: 'Vitesse verticale', swatch: <span className="h-0.5 w-4 rounded" style={{ background: PHASE_COLOUR.descending }} /> }]} />
      </TabsContent>
    </Tabs>
  );
}

function Legend({ items }: { items: { label: string; swatch: ReactNode }[] }) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-[11px]">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.swatch} {it.label}
        </span>
      ))}
    </div>
  );
}
