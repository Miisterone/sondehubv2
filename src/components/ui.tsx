import type { ComponentProps, ReactNode } from 'react';
import { cn } from 'cn';
import type { FlightPhase } from '@/lib/types';
import { iconUrl, PHASE_COLOUR, PHASE_LABEL, type IconId } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Kept as an alias of shadcn's `cn` so existing call sites keep working. */
export const cx = cn;

/**
 * Square icon button with a tooltip (shadcn Button + Tooltip).
 * `active` renders it as a pressed/primary toggle.
 */
export function IconButton({
  children,
  active,
  className,
  label,
  side = 'left',
  ...rest
}: ComponentProps<typeof Button> & { active?: boolean; label: string; side?: 'left' | 'right' | 'top' | 'bottom' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'default' : 'ghost'}
          size="icon"
          aria-label={label}
          aria-pressed={active}
          className={cn('size-9 rounded-xl', active ? 'shadow-md shadow-primary/30' : 'text-muted-foreground hover:text-foreground', className)}
          {...rest}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg-b" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lg-b)" />
      <ellipse cx="16" cy="12.5" rx="6.6" ry="7.4" fill="#fff" />
      <ellipse cx="13.6" cy="10" rx="1.6" ry="2.6" fill="#c7d2fe" transform="rotate(-25 13.6 10)" />
      <path d="M16 20v4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="14.2" y="24.5" width="3.6" height="3" rx="0.8" fill="#fff" />
    </svg>
  );
}

export function PhaseBadge({ phase, className }: { phase: FlightPhase; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 rounded-full border-transparent px-2 py-0.5 text-[11px] font-semibold', className)}
      style={{ color: PHASE_COLOUR[phase], background: `${PHASE_COLOUR[phase]}1f` }}
    >
      <span className={cn('size-1.5 rounded-full', phase !== 'lost' && phase !== 'landed' && 'live-dot')} style={{ background: PHASE_COLOUR[phase] }} />
      {PHASE_LABEL[phase]}
    </Badge>
  );
}

export function Stat({ label, value, sub, accent, icon }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; icon?: ReactNode }) {
  return (
    <div className="bg-chip min-w-0 rounded-xl px-3 py-2">
      <div className="text-faint flex items-center gap-1 truncate text-[10.5px] font-medium tracking-wide uppercase">
        {icon && <span className="shrink-0 opacity-80 [&>svg]:size-3">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular truncate font-mono text-[15px] font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-dim truncate text-[11px]">{sub}</div>}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-faint text-[11px] font-semibold tracking-wider uppercase">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Single-choice segmented control (shadcn ToggleGroup). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v: string) => v && onChange(v as T)}
      className={cn('bg-muted rounded-lg p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            'text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground rounded-md! font-medium data-[state=on]:shadow-sm',
            size === 'sm' ? 'h-6 min-w-0 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Labelled switch row (shadcn Switch). */
export function Toggle({ checked, onChange, label, hint, swatch }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; swatch?: ReactNode }) {
  return (
    <label className="hover:bg-accent/60 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors">
      {swatch}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">{label}</span>
        {hint && <span className="text-muted-foreground block text-[11px]">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Tiny altitude sparkline drawn from a track. */
export function Sparkline({ values, colour, width = 64, height = 22 }: { values: number[]; colour: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const step = Math.max(1, Math.floor(values.length / 40));
  const v = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  // Floor the vertical span so GPS jitter of a sonde on the ground reads as a flat line.
  const min = Math.min(...v);
  const max = Math.max(...v, min + 2000);
  const span = max - min;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 2 - ((y - min) / span) * (height - 4)).toFixed(1)}`);
  const id = `sg-${colour.slice(1)}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={colour} stopOpacity="0.35" />
          <stop offset="1" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={colour} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** The exact icon drawn on the map, reused in the UI. */
export function MapIcon({ id, size = 20, className, title }: { id: IconId; size?: number; className?: string; title?: string }) {
  return <img src={iconUrl(id)} width={size} height={size} alt="" title={title} draggable={false} className={cx('inline-block shrink-0 select-none', className)} />;
}
