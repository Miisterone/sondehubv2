import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cx } from './ui';
import { Icon3D, type Icon3DId } from './Icon3D';

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

const STEPS: { icon: Icon3DId; title: string; text: string }[] = [
  { icon: 'ascending', title: 'Montée', text: 'Le ballon monte d’environ 5 m/s (18 km/h) pendant 1 h 30 à 2 h.' },
  { icon: 'burst', title: 'Éclatement', text: 'Vers 20 à 35 km d’altitude, le ballon, devenu énorme, éclate.' },
  { icon: 'descending', title: 'Descente', text: 'La sonde redescend sous un petit parachute, en 30 à 45 min.' },
  { icon: 'landed', title: 'Au sol', text: 'Elle tombe souvent à plusieurs dizaines de kilomètres du lâcher. Vous pouvez la chercher et signaler votre trouvaille.' },
];

export function FlightGuide({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cx(
            'text-primary focus-visible:ring-ring/50 flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2',
            className,
          )}
        >
          <CircleHelp className="size-4" />
          Comment ça marche ?
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" collisionPadding={12} className="w-[320px] p-5" onEscapeKeyDown={keepSelection}>
        <h2 className="text-[16px] font-semibold">Le vol d’une radiosonde</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed">
          Chaque jour, des stations météo lâchent des ballons qui emportent une petite sonde. Elle mesure la température, l’humidité et le vent en montant, et
          envoie ses données par radio. Ces mesures alimentent les prévisions météo du monde entier.
        </p>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="-my-1 grid size-10 shrink-0 place-items-center">
                <Icon3D id={s.icon} size={40} />
              </span>
              <span className="min-w-0 text-[13px] leading-snug">
                <span className="text-foreground block font-semibold">
                  <span className="tabular text-faint mr-1 font-normal">{i + 1}.</span>
                  {s.title}
                </span>
                {s.text}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex gap-3 border-t pt-4 text-[13px] leading-snug">
          <span className="-my-1 grid size-10 shrink-0 place-items-center">
            <Icon3D id="lost" size={40} />
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
