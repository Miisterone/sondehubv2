import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t, useT } from '@/i18n';
import { cx } from './ui';

const LABEL = {
  get live() {
    return t('sidebar.connection.live');
  },
  get connecting() {
    return t('sidebar.connection.connecting');
  },
  get offline() {
    return t('sidebar.connection.offline');
  },
};
const DOT = { live: 'bg-live', connecting: 'bg-faint', offline: 'bg-destructive' } as const;

export function StatusPill() {
  const conn = useStore((s) => s.conn);
  const rate = useStore((s) => s.msgRate);
  const t = useT();
  const hint =
    conn === 'live'
      ? rate >= 1
        ? t('sidebar.connection.liveRateHint', { count: Math.round(rate) })
        : t('sidebar.connection.liveHint')
      : conn === 'connecting'
        ? t('sidebar.connection.connectingHint')
        : t('sidebar.connection.offlineHint');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          role="status"
          aria-label={t('sidebar.connection.ariaLabel', { status: LABEL[conn], hint })}
          className="bg-background text-muted-foreground border-border h-7 cursor-default gap-1.5 rounded-md px-2 text-[12px] font-medium"
        >
          <span className={cx('relative size-2 shrink-0 rounded-full', DOT[conn], conn === 'live' && 'live-dot')} />
          {LABEL[conn]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
