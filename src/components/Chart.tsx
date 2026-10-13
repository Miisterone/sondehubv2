import { useEffect, useRef } from 'react';
import uPlot, { type AlignedData, type Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../store/useStore';

export function Chart({ data, makeOptions, height = 180 }: { data: AlignedData; makeOptions: (theme: ChartTheme) => Omit<Options, 'width' | 'height'>; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useStore((s) => s.settings.theme);
  const optsRef = useRef(makeOptions);
  optsRef.current = makeOptions;

  useEffect(() => {
    const node = el.current!;
    const t = chartTheme(theme);
    const u = new uPlot({ ...optsRef.current(t), width: node.clientWidth || 300, height }, data, node);
    plot.current = u;
    const ro = new ResizeObserver(() => u.setSize({ width: node.clientWidth, height }));
    ro.observe(node);
    return () => {
      ro.disconnect();
      u.destroy();
      plot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, height]);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  return <div ref={el} className="w-full" />;
}

export interface ChartTheme {
  axis: string;
  grid: string;
  text: string;
  accent: string;
  accentFill: string;
  secondary: string;
}

export function chartTheme(theme: 'dark' | 'light'): ChartTheme {
  return theme === 'dark'
    ? { axis: '#262a30', grid: '#1c2025', text: '#a3adba', accent: '#8199f0', accentFill: 'rgba(129,153,240,0.10)', secondary: '#a3adba' }
    : { axis: '#e6e8eb', grid: '#f0f2f4', text: '#425466', accent: '#3451d1', accentFill: 'rgba(52,81,209,0.08)', secondary: '#425466' };
}

export function axis(t: ChartTheme, extra: Partial<uPlot.Axis> = {}): uPlot.Axis {
  return {
    stroke: t.text,
    grid: { stroke: t.grid, width: 1 },
    ticks: { stroke: t.axis, width: 1, size: 4 },
    font: '11px "Open Sans Variable", system-ui, sans-serif',
    size: 38,
    gap: 4,
    ...extra,
  };
}
