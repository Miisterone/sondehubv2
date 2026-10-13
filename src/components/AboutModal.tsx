import type { ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { PHASE_LABEL, type IconId } from '@/lib/icons';
import { useStore } from '@/store/useStore';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Logo, MapIcon } from './ui';

const LEGEND: [IconId, string][] = [
  ['sonde-ascending', PHASE_LABEL.ascending],
  ['sonde-descending', PHASE_LABEL.descending],
  ['sonde-landed', PHASE_LABEL.landed],
  ['sonde-lost', PHASE_LABEL.lost],
  ['heading-ascending', 'Direction de dérive'],
  ['burst', 'Éclatement du ballon'],
  ['landing', 'Atterrissage prévu'],
  ['listener', 'Station de réception'],
  ['chase', 'Véhicule de poursuite'],
  ['site', 'Site de lâcher'],
  ['recovery-ok', 'Sonde récupérée'],
  ['recovery-ko', 'Sonde non retrouvée'],
];

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent,
  );

const SHORTCUTS: [string, string][] = [
  [isMac ? '⌘K' : 'Ctrl K', 'Palette de commandes'],
  ['/', 'Rechercher'],
  ['Échap', 'Fermer la fiche'],
  ['F', 'Suivre la sonde'],
  ['Entrée', 'Ouvrir le 1er résultat'],
];

const linkCls = 'text-primary font-medium underline-offset-4 hover:underline';

const FAQ: [string, ReactNode][] = [
  [
    'Qu’est-ce qu’une radiosonde ?',
    <>
      Un petit boîtier électronique de quelques centaines de grammes, emporté par un ballon gonflé à l’hélium ou à l’hydrogène. Il mesure la
      pression, la température et l’humidité, en déduit le vent grâce à son GPS, et transmet le tout par radio chaque seconde. Les services
      météorologiques en lâchent environ deux fois par jour (vers 00 h et 12 h UTC) pour alimenter les prévisions. Vers 30 km d’altitude, le ballon
      éclate et la sonde redescend sous un petit parachute.
    </>,
  ],
  [
    'D’où viennent les données ?',
    <>
      Des radioamateurs et passionnés, équipés d’un récepteur souvent très simple (clé SDR et antenne), décodent les signaux et les envoient au
      réseau{' '}
      <a className={linkCls} href="https://sondehub.org" target="_blank" rel="noreferrer">
        SondeHub
      </a>
      , qui les met librement à disposition. Les trajectoires et points d’atterrissage prévus sont calculés par le modèle Tawhiri (CUSF) à partir
      des prévisions de vent. SondeTrack ne fait qu’afficher ces données.
    </>,
  ],
  [
    'Quelle est la précision de la prédiction d’atterrissage ?',
    <>
      Elle dépend surtout de la qualité des prévisions de vent. Approximative pendant la montée, elle s’affine nettement pendant la descente, à mesure
      que la sonde se rapproche du sol : elle est en général juste à quelques kilomètres près. La sonde passe souvent sous l’horizon radio avant de
      toucher le sol, donc la dernière position reçue reste un indice précieux.
    </>,
  ],
  [
    'J’ai trouvé une sonde, que faire ?',
    <>
      Elle est sans danger. Vous pouvez la garder, ou la recycler (électronique et piles) selon les règles de votre commune. Pensez à la signaler sur
      SondeHub avec le bouton « Signaler une récupération » de sa fiche : cela aide toute la communauté. Pour votre sécurité, respectez les propriétés
      privées, restez prudent au bord des routes, et ne grimpez jamais dans un arbre ni près d’une ligne électrique pour la récupérer.
    </>,
  ],
  [
    'Comment être alerté ?',
    <>
      Activez votre position, puis les alertes d’atterrissage dans le panneau des couches (à droite de la carte). SondeTrack vous prévient quand un
      atterrissage est prévu près de chez vous, tant que la page reste ouverte.
    </>,
  ],
];

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">{children}</h3>;
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="glass glass-strong scroll-thin max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-2xl p-5 sm:max-w-lg sm:p-6"
      >
        <DialogHeader className="mb-4 flex-row items-center gap-3 pr-8 text-left">
          <Logo className="size-11 shrink-0" />
          <div className="min-w-0 space-y-1">
            <DialogTitle>SondeTrack</DialogTitle>
            <DialogDescription>Suivi des radiosondes météo en temps réel</DialogDescription>
          </div>
        </DialogHeader>
        <DialogClose asChild>
          <Button variant="ghost" size="icon" aria-label="Fermer" className="text-muted-foreground absolute top-3 right-3 size-8 rounded-lg">
            <X className="size-4" />
          </Button>
        </DialogClose>

        <div className="text-muted-foreground space-y-3 text-[13.5px] leading-relaxed">
          <p>
            Chaque jour, plus de 1 500 radiosondes sont lâchées dans le monde sous des ballons météo. Elles mesurent température, humidité et vent
            jusqu’à plus de 30 km d’altitude, puis redescendent en parachute après l’éclatement du ballon.
          </p>
          <p>
            Un réseau de radioamateurs décode leurs signaux et les partage via{' '}
            <a className={linkCls} href="https://sondehub.org" target="_blank" rel="noreferrer">
              SondeHub
            </a>
            . Cette interface affiche ces données en direct, avec les prédictions d’atterrissage pour aider à les retrouver.
          </p>
          <button
            type="button"
            onClick={() => {
              useStore.getState().setSettings({ onboarded: false });
              onClose();
            }}
            className={`${linkCls} inline-flex items-center gap-1.5 rounded-sm text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
          >
            <RotateCcw className="size-3.5" />
            Revoir l’introduction
          </button>
        </div>

        <section className="mt-5">
          <Heading>Questions fréquentes</Heading>
          <Accordion type="single" collapsible className="border-soft rounded-xl border px-3">
            {FAQ.map(([q, a], i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-soft">
                <AccordionTrigger className="py-2.5 text-[13.5px] hover:no-underline">{q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-[13px] leading-relaxed">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="mt-5">
          <Heading>Légende</Heading>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
            {LEGEND.map(([id, label]) => (
              <div key={id} className="flex min-w-0 items-center gap-2.5">
                <span className="bg-chip grid size-8 shrink-0 place-items-center rounded-lg">
                  <MapIcon id={id} size={22} />
                </span>
                <span className="min-w-0 leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <Heading>Raccourcis</Heading>
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="text-muted-foreground grid grid-cols-[3.75rem_1fr] items-center gap-1">
                <Kbd className="bg-chip text-foreground justify-self-start font-mono">{key}</Kbd>
                {label}
              </div>
            ))}
          </div>
        </section>

        <Separator className="my-4" />

        <p className="text-muted-foreground text-xs leading-relaxed">
          Données : SondeHub (Project Horus) — API publique api.v2.sondehub.org. Prédictions : Tawhiri (CUSF). Fonds de carte : OpenFreeMap,
          OpenStreetMap, Esri, OpenTopoMap. Projet indépendant, non affilié à SondeHub. En cas de récupération d’une sonde, pensez à la signaler sur
          sondehub.org.
        </p>
      </DialogContent>
    </Dialog>
  );
}
