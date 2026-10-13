import type { ComponentProps, ReactNode } from 'react';
import { cn } from 'cn';
import type { FlightPhase } from '@/lib/types';
import { iconUrl, PHASE_COLOUR, PHASE_LABEL, type IconId } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const cx = cn;

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
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'size-9 rounded-md',
            active ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary' : 'text-muted-foreground hover:text-foreground',
            className,
          )}
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
    <svg viewBox="0 0 32 32" className={cn('text-primary', className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <ellipse cx="16" cy="12.5" rx="6.6" ry="7.4" fill="#fff" />
      <path d="M16 20v4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="14.2" y="24.5" width="3.6" height="3" rx="0.8" fill="#fff" />
    </svg>
  );
}

export function PhaseBadge({ phase, className }: { phase: FlightPhase; className?: string }) {
  return (
    <span
      className={cn(
        'text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap',
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: PHASE_COLOUR[phase] }} />
      {PHASE_LABEL[phase]}
    </span>
  );
}

export function Stat({ label, value, sub, accent, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; accent?: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
        {icon && <span className="text-faint shrink-0 [&>svg]:size-3.5">{icon}</span>}
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className="tabular text-foreground mt-0.5 truncate text-[15px] font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-faint truncate text-[12px]">{sub}</div>}
    </div>
  );
}

export function Section({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

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
      className={cn('bg-surface rounded-md border p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            'text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:border-border rounded-[5px]! border border-transparent font-medium hover:bg-transparent',
            size === 'sm' ? 'h-7 min-w-0 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function Toggle({ checked, onChange, label, hint, swatch }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; swatch?: ReactNode }) {
  return (
    <label className="hover:bg-surface flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors">
      {swatch}
      <span className="min-w-0 flex-1">
        <span className="text-foreground block text-[13.5px]">{label}</span>
        {hint && <span className="text-muted-foreground block text-[12px]">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function Sparkline({ values, colour, width = 64, height = 22 }: { values: number[]; colour: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const step = Math.max(1, Math.floor(values.length / 40));
  const v = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  const min = Math.min(...v);
  const max = Math.max(...v, min + 2000);
  const span = max - min;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 2 - ((y - min) / span) * (height - 4)).toFixed(1)}`);
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={colour} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function MapIcon({ id, size = 20, className, title }: { id: IconId; size?: number; className?: string; title?: string }) {
  return <img src={iconUrl(id)} width={size} height={size} alt="" title={title} draggable={false} className={cx('inline-block shrink-0 select-none', className)} />;
}
