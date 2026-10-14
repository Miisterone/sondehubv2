import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cx } from './ui';

const LABEL = { live: 'En direct', connecting: 'Connexion…', offline: 'Hors ligne' } as const;
const DOT = { live: 'bg-live', connecting: 'bg-faint', offline: 'bg-destructive' } as const;

export function StatusPill() {
  const conn = useStore((s) => s.conn);
  const rate = useStore((s) => s.msgRate);
  const hint =
    conn === 'live'
      ? `Les positions se mettent à jour en temps réel${rate >= 1 ? ` (${rate.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} mesures reçues par seconde)` : ''}.`
      : conn === 'connecting'
        ? 'Connexion au temps réel en cours…'
        : 'Temps réel interrompu, reconnexion en cours : les positions affichées peuvent dater.';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          role="status"
          aria-label={`${LABEL[conn]}. ${hint}`}
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
