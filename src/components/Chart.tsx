import { useEffect, useRef } from 'react';
import uPlot, { type AlignedData, type Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../store/useStore';
import { chartTheme, type ChartTheme } from '@/lib/chartTheme';

export { chartTheme, type ChartTheme };

export const FONT = '"Open Sans Variable", system-ui, sans-serif';

export function axis(t: ChartTheme, extra: Partial<uPlot.Axis> = {}): uPlot.Axis {
  return {
    stroke: t.text,
    grid: { stroke: t.grid, width: 1 },
    ticks: { show: false },
    font: `11px ${FONT}`,
    size: 30,
    gap: 6,
    ...extra,
  };
}

export type Annotate = (u: uPlot, t: ChartTheme) => void;

export function Chart({
  data,
  makeOptions,
  height = 180,
  onIndex,
  annotate,
  label,
}: {
  data: AlignedData;
  makeOptions: (theme: ChartTheme) => Omit<Options, 'width' | 'height'>;
  height?: number;
  onIndex?: (idx: number | null) => void;
  annotate?: Annotate;
  label: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useStore((s) => s.settings.theme);
  const optsRef = useRef(makeOptions);
  const indexRef = useRef(onIndex);
  const annotateRef = useRef(annotate);
  const dataRef = useRef(data);
  optsRef.current = makeOptions;
  indexRef.current = onIndex;
  annotateRef.current = annotate;
  dataRef.current = data;

  useEffect(() => {
    const node = el.current!;
    const t = chartTheme(theme);
    const base = optsRef.current(t);
    let last: number | null = null;
    const opts: Options = {
      ...base,
      width: node.clientWidth || 300,
      height,
      plugins: [...(base.plugins ?? []), touchPlugin()],
      hooks: {
        ...base.hooks,
        setCursor: [
          ...(base.hooks?.setCursor ?? []),
          (u) => {
            const idx = u.cursor.left !== undefined && u.cursor.left >= 0 ? (u.cursor.idx ?? null) : null;
            if (idx === last) return;
            last = idx;
            indexRef.current?.(idx);
          },
        ],
        draw: [...(base.hooks?.draw ?? []), (u) => annotateRef.current?.(u, t)],
      },
    };
    const u = new uPlot(opts, dataRef.current, node);
    plot.current = u;
    const ro = new ResizeObserver(() => {
      if (node.clientWidth > 0 && node.clientWidth !== u.width) u.setSize({ width: node.clientWidth, height });
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      u.destroy();
      plot.current = null;
      indexRef.current?.(null);
    };
  }, [theme, height]);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  return <div ref={el} role="img" aria-label={label} className="st-chart w-full" />;
}

type SetCursor = (opts: { left: number; top: number }, fire?: boolean, pub?: boolean) => void;

function touchPlugin(): uPlot.Plugin {
  return {
    hooks: {
      init: (u) => {
        const over = u.over;
        const set = (left: number, top: number) => (u.setCursor as SetCursor)({ left, top }, true, true);
        over.style.touchAction = 'pan-y';
        let timer = 0;
        let lastTouch = 0;
        const move = (e: TouchEvent) => {
          const p = e.touches[0];
          if (!p) return;
          lastTouch = Date.now();
          const r = over.getBoundingClientRect();
          window.clearTimeout(timer);
          set(Math.max(0, Math.min(r.width, p.clientX - r.left)), p.clientY - r.top);
        };
        const end = () => {
          lastTouch = Date.now();
          window.clearTimeout(timer);
          timer = window.setTimeout(() => set(-10, -10), 2500);
        };
        const swallow = (e: Event) => {
          if (Date.now() - lastTouch < 1000) e.stopImmediatePropagation();
        };
        over.addEventListener('touchstart', move, { passive: true });
        over.addEventListener('touchmove', move, { passive: true });
        over.addEventListener('touchend', end, { passive: true });
        over.addEventListener('touchcancel', end, { passive: true });
        for (const name of ['mouseenter', 'mousemove', 'mousedown', 'mouseup', 'mouseleave']) over.addEventListener(name, swallow, true);
      },
    },
  };
}

export function cursorOptions(t: ChartTheme, syncKey?: string): uPlot.Cursor {
  return {
    y: false,
    drag: { x: false, y: false, setScale: false },
    points: {
      size: 9,
      width: 2,
      stroke: () => t.surface,
      fill: (u, si) => {
        const s = u.series[si].stroke;
        return typeof s === 'function' ? (s(u, si) as string) : (s as string);
      },
    },
    ...(syncKey ? { sync: { key: syncKey } } : {}),
  };
}

export const px = () => uPlot.pxRatio;

export function inPlot(u: uPlot, x: number, y: number) {
  const b = u.bbox;
  return x >= b.left - 1 && x <= b.left + b.width + 1 && y >= b.top - 1 && y <= b.top + b.height + 1;
}

export function drawDot(u: uPlot, x: number, y: number, fill: string, ring: string, r = 4, hollow = false) {
  const ctx = u.ctx;
  const k = px();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, (r + 2) * k, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * k, 0, Math.PI * 2);
  if (hollow) {
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = fill;
    ctx.stroke();
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.restore();
}

export function drawVLine(u: uPlot, x: number, color: string, dash: number[] = []) {
  const ctx = u.ctx;
  const b = u.bbox;
  const k = px();
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = k;
  ctx.setLineDash(dash.map((v) => v * k));
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, b.top);
  ctx.lineTo(Math.round(x) + 0.5, b.top + b.height);
  ctx.stroke();
  ctx.restore();
}

export function drawHLine(u: uPlot, y: number, color: string, width = 1, dash: number[] = []) {
  const ctx = u.ctx;
  const b = u.bbox;
  const k = px();
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * k;
  ctx.setLineDash(dash.map((v) => v * k));
  ctx.beginPath();
  ctx.moveTo(b.left, Math.round(y) + 0.5);
  ctx.lineTo(b.left + b.width, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.restore();
}

export type Box = { x: number; y: number; w: number; h: number };

export function drawLabel(
  u: uPlot,
  t: ChartTheme,
  x: number,
  y: number,
  text: string,
  opts: { prefer?: 'left' | 'right' | 'center'; above?: boolean; weight?: 400 | 600; avoid?: Box[] } = {},
): Box | null {
  const ctx = u.ctx;
  const b = u.bbox;
  const k = px();
  const size = 11.5 * k;
  ctx.save();
  ctx.font = `${opts.weight ?? 600} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  const h = size * 1.25;
  const gap = 8 * k;
  const right = b.left + b.width;
  const align = opts.prefer ?? 'right';
  let lx = align === 'right' ? x + gap : align === 'left' ? x - gap - w : x - w / 2;
  if (lx + w > right) lx = x - gap - w;
  if (lx < b.left) lx = Math.min(right - w, x + gap);
  if (align === 'center') lx = Math.max(b.left, Math.min(right - w, x - w / 2));
  let ly = opts.above === false ? y + gap : y - gap - h;
  if (ly < b.top) ly = y + gap;
  if (ly + h > b.top + b.height) ly = y - gap - h;
  const box = { x: lx, y: ly, w, h };
  if (opts.avoid?.some((o) => lx < o.x + o.w && lx + w > o.x && ly < o.y + o.h && ly + h > o.y)) {
    ctx.restore();
    return null;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = t.surface;
  ctx.strokeText(text, lx, ly);
  ctx.fillStyle = opts.weight === 400 ? t.text : t.ink;
  ctx.fillText(text, lx, ly);
  ctx.restore();
  return box;
}

export function drawEdgeLabel(u: uPlot, t: ChartTheme, x: number, text: string, side: 'left' | 'right') {
  const ctx = u.ctx;
  const b = u.bbox;
  const k = px();
  ctx.save();
  ctx.font = `400 ${11 * k}px ${FONT}`;
  const w = ctx.measureText(text).width;
  const lx = side === 'right' ? x + 5 * k : x - 5 * k - w;
  if (lx < b.left || lx + w > b.left + b.width) {
    ctx.restore();
    return;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 4 * k;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = t.surface;
  ctx.strokeText(text, lx, b.top + 2 * k);
  ctx.fillStyle = t.text;
  ctx.fillText(text, lx, b.top + 2 * k);
  ctx.restore();
}
