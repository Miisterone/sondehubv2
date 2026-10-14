import type { ReactNode } from 'react';
import { useT } from '@/i18n';

export function LineKey({ predicted }: { predicted: boolean }) {
  return <span aria-hidden className={predicted ? 'key-dashed' : 'key-solid'} />;
}

export function Readout({ value, caption, aside }: { value: ReactNode; caption: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-end justify-between gap-3" aria-live="off">
      <div className="min-w-0">
        <div className="font-heading tabular text-foreground text-[20px] leading-tight font-semibold">{value}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-[12.5px]">{caption}</div>
      </div>
      {aside && <div className="tabular shrink-0 text-right text-[12.5px] leading-snug">{aside}</div>}
    </div>
  );
}

export function ChartLegend({ forecast, measuredLabel, forecastLabel }: { forecast: boolean; measuredLabel?: string; forecastLabel?: string }) {
  const t = useT();
  if (!forecast) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
      <span className="flex items-center gap-1.5">
        <LineKey predicted={false} /> {measuredLabel ?? t('charts.legend.measured')}
      </span>
      <span className="flex items-center gap-1.5">
        <LineKey predicted /> {forecastLabel ?? t('charts.legend.forecast')}
      </span>
    </div>
  );
}
