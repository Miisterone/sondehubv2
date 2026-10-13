import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cx } from './ui';

const LABEL = { live: 'Direct', connecting: 'Connexion', offline: 'Hors ligne' } as const;
const DOT = { live: 'bg-emerald-400', connecting: 'bg-amber-400', offline: 'bg-rose-500' } as const;

export function StatusPill() {
  const conn = useStore((s) => s.conn);
  const rate = useStore((s) => s.msgRate);
  const hint =
    conn === 'live'
      ? `Flux temps réel actif — ${rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} trames/s`
      : conn === 'connecting'
        ? 'Connexion au flux temps réel…'
        : 'Flux temps réel indisponible, mise à jour périodique';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          role="status"
          aria-label={`${LABEL[conn]} — ${hint}`}
          className="bg-muted/60 dark:bg-muted/50 text-muted-foreground h-6 cursor-default gap-1.5 rounded-full border-transparent px-2 text-[11px] font-medium"
        >
          <span className={cx('size-1.5 shrink-0 rounded-full', DOT[conn], conn === 'live' && 'live-dot')} />
          {LABEL[conn]}
          {conn === 'live' && <span className="tabular text-muted-foreground/80 font-mono">{rate.toFixed(0)}/s</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  );
}
