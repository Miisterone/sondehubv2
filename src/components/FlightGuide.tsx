import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IconId } from '@/lib/icons';
import { MapIcon, cx } from './ui';

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

const STEPS: { icon: IconId; title: string; text: string }[] = [
  { icon: 'sonde-ascending', title: 'Montée', text: 'Le ballon monte d’environ 5 m/s (18 km/h) pendant 1 h 30 à 2 h.' },
  { icon: 'burst', title: 'Éclatement', text: 'Vers 20 à 35 km d’altitude, le ballon, devenu énorme, éclate.' },
  { icon: 'sonde-descending', title: 'Descente', text: 'La sonde redescend sous un petit parachute, en 30 à 45 min.' },
  { icon: 'sonde-landed', title: 'Au sol', text: 'Elle tombe souvent à plusieurs dizaines de kilomètres du lâcher. Vous pouvez la chercher et signaler votre trouvaille.' },
];

export function FlightGuide({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cx(
            'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 data-[state=open]:text-foreground flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium transition-colors outline-none focus-visible:ring-2',
            className,
          )}
        >
          <CircleHelp className="size-3.5" />
          Comment ça marche ?
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" collisionPadding={12} className="w-[300px] p-4" onEscapeKeyDown={keepSelection}>
        <h2 className="text-[13.5px] font-semibold">Le vol d’une radiosonde</h2>
        <p className="text-muted-foreground mt-1 text-[12px] leading-snug">
          Chaque jour, des stations météo lâchent des ballons qui emportent une petite sonde. Elle mesure la température, l’humidité et le vent en montant, et
          envoie ses données par radio.
        </p>
        <ol className="mt-3 space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-2.5">
              <span className="bg-chip relative grid size-8 shrink-0 place-items-center rounded-lg">
                <MapIcon id={s.icon} size={20} />
                <span className="bg-background text-muted-foreground absolute -top-1 -left-1 grid size-4 place-items-center rounded-full border text-[9.5px] font-semibold">
                  {i + 1}
                </span>
              </span>
              <span className="min-w-0 text-[12px] leading-snug">
                <span className="block font-semibold">{s.title}</span>
                <span className="text-muted-foreground">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="text-muted-foreground mt-3 flex gap-2.5 border-t pt-3 text-[12px] leading-snug">
          <span className="grid size-8 shrink-0 place-items-center">
            <MapIcon id="sonde-lost" size={20} />
          </span>
          <span className="min-w-0">
            <span className="text-foreground font-semibold">Signal perdu</span> : la sonde n’est plus captée, en général parce qu’elle est passée trop bas
            pour les antennes. Elle est alors souvent déjà au sol.
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
