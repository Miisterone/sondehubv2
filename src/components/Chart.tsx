import { useEffect, useRef } from 'react';
import uPlot, { type AlignedData, type Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../store/useStore';

/** Thin uPlot wrapper that follows its container width and the app theme. */
export function Chart({ data, makeOptions, height = 180 }: { data: AlignedData; makeOptions: (theme: ChartTheme) => Omit<Options, 'width' | 'height'>; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useStore((s) => s.settings.theme);
  const optsRef = useRef(makeOptions);
  optsRef.current = makeOptions;

  // (Re)create on theme change: axis colours are baked into options.
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
}

export function chartTheme(theme: 'dark' | 'light'): ChartTheme {
  return theme === 'dark'
    ? { axis: 'rgba(148,163,184,0.25)', grid: 'rgba(148,163,184,0.08)', text: '#7c8aa0' }
    : { axis: 'rgba(15,23,42,0.18)', grid: 'rgba(15,23,42,0.06)', text: '#64748b' };
}

export function axis(t: ChartTheme, extra: Partial<uPlot.Axis> = {}): uPlot.Axis {
  return {
    stroke: t.text,
    grid: { stroke: t.grid, width: 1 },
    ticks: { stroke: t.axis, width: 1, size: 4 },
    font: '10.5px Inter Variable, system-ui, sans-serif',
    size: 38,
    gap: 4,
    ...extra,
  };
}
