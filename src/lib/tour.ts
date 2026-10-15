export const NEARBY_EVENT = 'sondehubv2:nearby';
export const SHEET_EVENT = 'sondehubv2:sheet';
export const TAB_EVENT = 'sondehubv2:tab';

export type SheetSnap = 'peek' | 'half' | 'full';
export type SidebarTab = 'nearby' | 'flying' | 'following' | 'history';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'right' | 'left' | 'bottom' | 'top' | 'inside' | 'center';

const HOLE_RADIUS = 8;
const MIN_CARD_H = 200;

export function fromDom(r: DOMRect): Rect {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function inflate(r: Rect, p: number): Rect {
  return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 };
}

export function clampRect(r: Rect, vw: number, vh: number): Rect | null {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(vw, r.x + r.w);
  const y1 = Math.min(vh, r.y + r.h);
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function intersects(a: Rect, b: Rect, slack = 0): boolean {
  return a.x < b.x + b.w + slack && b.x < a.x + a.w + slack && a.y < b.y + b.h + slack && b.y < a.y + a.h + slack;
}

function bounds(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function mergeHoles(rects: Rect[]): Rect[] {
  const out = rects.slice();
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (!intersects(out[i], out[j], 2)) continue;
      out[i] = bounds(out[i], out[j]);
      out.splice(j, 1);
      j = i;
    }
  }
  return out;
}

export function collapse(r: Rect): Rect {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: 0, h: 0 };
}

export function lerpRect(a: Rect, b: Rect, k: number): Rect {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function roundedRect({ x, y, w, h }: Rect): string {
  if (w < 0.5 || h < 0.5) return '';
  const r = Math.min(HOLE_RADIUS, w / 2, h / 2);
  const f = (n: number) => Math.round(n * 10) / 10;
  return (
    `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}` +
    `V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}` +
    `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}` +
    `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`
  );
}

export function holesPath(holes: Rect[]): string {
  return holes.map(roundedRect).join('');
}

export function shadePath(holes: Rect[], vw: number, vh: number): string {
  return `M0 0H${vw}V${vh}H0Z${holesPath(holes)}`;
}

interface Box {
  w: number;
  h: number;
}

type Align = 'center' | 'start' | 'end';
const ALIGNS: Align[] = ['center', 'start', 'end'];

function along(start: number, size: number, item: number, align: Align, min: number, max: number): number {
  const v = align === 'start' ? start : align === 'end' ? start + size - item : start + size / 2 - item / 2;
  return Math.min(Math.max(v, min), max);
}

export function placeCard(anchor: Rect | null, holes: Rect[], card: Box, vw: number, vh: number, sides: Side[], margin: number, gap: number): { x: number; y: number; maxH?: number } {
  const maxX = Math.max(margin, vw - card.w - margin);
  const maxY = Math.max(margin, vh - card.h - margin);
  const centred = { x: (vw - card.w) / 2, y: Math.min(maxY, Math.max(margin, (vh - card.h) / 2)) };
  if (!anchor) return centred;

  const clear = (x: number, y: number) => {
    const c = { x, y, w: card.w, h: card.h };
    return x >= margin - 0.5 && y >= margin - 0.5 && x + card.w <= vw - margin + 0.5 && y + card.h <= vh - margin + 0.5 && !holes.some((h) => intersects(c, h, gap / 2));
  };

  for (const side of sides) {
    if (side === 'center') {
      if (clear(centred.x, centred.y)) return centred;
      continue;
    }
    if (side === 'inside') {
      const x = along(anchor.x, anchor.w, card.w, 'center', margin, maxX);
      const y = Math.min(Math.max(anchor.y + anchor.h - card.h - margin * 2, margin), maxY);
      return { x, y };
    }
    if (side === 'right' || side === 'left') {
      const base = side === 'right' ? anchor.x + anchor.w + gap : anchor.x - gap - card.w;
      const xs = [
        base,
        ...holes
          .map((h) => (side === 'right' ? h.x + h.w + gap : h.x - gap - card.w))
          .filter((x) => (side === 'right' ? x > base : x < base))
          .sort((a, b) => (side === 'right' ? a - b : b - a)),
      ];
      for (const x of xs) {
        for (const align of ALIGNS) {
          const y = along(anchor.y, anchor.h, card.h, align, margin, maxY);
          if (clear(x, y)) return { x, y };
        }
      }
      continue;
    }
    for (const align of ALIGNS) {
      const y = side === 'bottom' ? anchor.y + anchor.h + gap : anchor.y - gap - card.h;
      const x = along(anchor.x, anchor.w, card.w, align, margin, maxX);
      if (clear(x, y)) return { x, y };
    }
  }

  const x = along(anchor.x, anchor.w, card.w, 'center', margin, maxX);
  const above = anchor.y - gap - margin;
  const below = vh - margin - (anchor.y + anchor.h + gap);
  if (Math.max(above, below) >= MIN_CARD_H) {
    if (above >= below) {
      const h = Math.min(card.h, above);
      return { x, y: anchor.y - gap - h, maxH: above };
    }
    return { x, y: anchor.y + anchor.h + gap, maxH: below };
  }
  return { x: Math.min(Math.max(centred.x, margin), maxX), y: maxY };
}
