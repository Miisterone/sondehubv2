import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from 'cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Escape closes the popover only: stop it reaching App's global "Escape = deselect" shortcut. */
const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

/**
 * Small ⓘ button that opens a short explanation of a technical term.
 * A Popover (click / tap) rather than a tooltip so it also works on touch screens.
 */
export function HelpHint({
  title,
  children,
  side = 'bottom',
  align = 'center',
  className,
}: {
  /** Term being explained: popover heading and accessible name of the trigger. */
  title: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Qu’est-ce que « ${title} » ?`}
          // The extra ::after area makes the 14 px icon an easy touch target without changing the layout.
          className={cn(
            'text-faint hover:text-foreground focus-visible:ring-ring/50 data-[state=open]:text-primary relative inline-grid size-3.5 shrink-0 cursor-help place-items-center rounded-full align-middle transition-colors outline-none after:absolute after:-inset-2 focus-visible:ring-2',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="size-3.5" strokeWidth={2.2} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        collisionPadding={12}
        className="w-64 space-y-1 p-3 text-[12.5px] leading-snug normal-case"
        onEscapeKeyDown={keepSelection}
      >
        <div className="text-foreground font-semibold tracking-normal">{title}</div>
        <div className="text-muted-foreground font-normal tracking-normal">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Plain-language explanations of the jargon shown in the sonde panel. */
export const HELP = {
  burst: {
    title: 'Éclatement',
    text: 'En montant, le ballon gonfle à mesure que la pression baisse, jusqu’à éclater, en général entre 20 et 35 km d’altitude. La sonde redescend ensuite sous un petit parachute.',
  },
  maxAlt: {
    title: 'Altitude max',
    text: 'Point le plus haut atteint jusqu’ici. Pendant la montée, l’altitude d’éclatement prévue est indiquée en dessous.',
  },
  prediction: {
    title: 'Prédiction',
    text: 'Trajectoire et point d’atterrissage calculés par le modèle Tawhiri à partir des prévisions de vent, puis recalculés au fil du vol. L’incertitude est typiquement de quelques kilomètres, et diminue à l’approche du sol.',
  },
  landing: {
    title: 'Atterrissage prévu',
    text: 'Point où la sonde devrait toucher le sol, calculé par le modèle Tawhiri à partir des prévisions de vent et mis à jour au fil du vol. Comptez typiquement quelques kilomètres d’incertitude.',
  },
  lost: {
    title: 'Signal perdu',
    text: 'La sonde n’est plus entendue par aucun récepteur. Le plus souvent, elle est simplement passée sous l’horizon radio des stations en descendant et a continué sa chute : elle se trouve alors probablement près de l’atterrissage estimé.',
  },
  rate: {
    title: 'Taux de montée / descente',
    text: 'Vitesse verticale moyenne du vol, utilisée pour la prédiction. Un ballon monte typiquement à 4–6 m/s ; sous parachute, la sonde descend vite en altitude puis ralentit vers 5 m/s près du sol, où l’air est plus dense.',
  },
  vspeed: {
    title: 'Vitesse verticale',
    text: 'Vitesse instantanée à laquelle la sonde monte (+) ou descend (−). La seconde ligne indique la vitesse et la direction de déplacement horizontal, poussée par le vent.',
  },
  sensors: {
    title: 'Capteurs & télémesure',
    text: 'Mesures envoyées par radio par la sonde : température, humidité et pression de l’air (le « sondage » météo, qui alimente les prévisions), plus des données techniques (batterie, satellites GPS, numéro de trame).',
  },
  profile: {
    title: 'Sondage T° / HR',
    text: 'Profil de température et d’humidité relative mesuré pendant la montée, en fonction de l’altitude. C’est la donnée météo que la sonde est chargée de recueillir.',
  },
  snr: {
    title: 'SNR',
    text: 'Rapport signal/bruit (en dB) mesuré par le récepteur : plus il est élevé, meilleure est la réception. En dessous de ~6 dB, le décodage devient difficile.',
  },
  elevation: {
    title: 'Élévation',
    text: 'Angle de la sonde au-dessus de votre horizon (0° = horizon, 90° = juste au-dessus de vous). Négatif, elle est sous l’horizon et hors de portée radio directe.',
  },
  receivers: {
    title: 'Récepteurs',
    text: 'Stations de radioamateurs et de passionnés qui captent et décodent le signal de la sonde (vers 400 MHz) et partagent ses positions sur SondeHub. Les icônes de voiture sont des récepteurs mobiles.',
  },
} satisfies Record<string, { title: string; text: string }>;
