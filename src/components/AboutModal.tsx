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
import { t, Trans, useT, type TKey } from '@/i18n';

const LEGEND: [IconId, () => string][] = [
  ['sonde-ascending', () => PHASE_LABEL.ascending],
  ['sonde-descending', () => PHASE_LABEL.descending],
  ['sonde-landed', () => PHASE_LABEL.landed],
  ['sonde-lost', () => PHASE_LABEL.lost],
  ['heading-ascending', () => t('app.about.legend.drift')],
  ['burst', () => t('app.about.legend.burst')],
  ['landing', () => t('app.about.legend.landing')],
  ['listener', () => t('app.about.legend.listener')],
  ['chase', () => t('app.about.legend.chase')],
  ['site', () => t('app.about.legend.site')],
  ['recovery-ok', () => t('app.about.legend.recoveryOk')],
  ['recovery-ko', () => t('app.about.legend.recoveryKo')],
];

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent,
  );

const SHORTCUTS: [string, () => string, () => string][] = [
  ['palette', () => (isMac ? '⌘K' : t('app.key.ctrlK')), () => t('app.command.title')],
  ['search', () => '/', () => t('app.about.shortcuts.search')],
  ['escape', () => t('app.key.escape'), () => t('app.about.shortcuts.closePanel')],
  ['follow', () => 'F', () => t('app.about.shortcuts.follow')],
  ['enter', () => t('app.key.enter'), () => t('app.about.shortcuts.openFirst')],
];

const linkCls = 'text-primary font-medium underline-offset-4 hover:underline';

const sondehubLink = (c: ReactNode) => (
  <a className={linkCls} href="https://sondehub.org" target="_blank" rel="noreferrer">
    {c}
  </a>
);

const githubLink = (c: ReactNode) => (
  <a className={linkCls} href="https://github.com/Miisterone/sondehubv2" target="_blank" rel="noreferrer">
    {c}
  </a>
);

const FAQ: [TKey, TKey][] = [
  ['app.about.faq.whatQ', 'app.about.faq.whatA'],
  ['app.about.faq.dataQ', 'app.about.faq.dataA'],
  ['app.about.faq.accuracyQ', 'app.about.faq.accuracyA'],
  ['app.about.faq.foundQ', 'app.about.faq.foundA'],
  ['app.about.faq.alertsQ', 'app.about.faq.alertsA'],
];

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[14px] font-semibold">{children}</h3>;
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="glass scroll-thin max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-lg p-5 sm:max-w-lg sm:p-6"
      >
        <DialogHeader className="mb-4 flex-row items-center gap-3 pr-8 text-left">
          <Logo className="size-11 shrink-0" />
          <div className="min-w-0 space-y-1">
            <DialogTitle>SondeHub V2</DialogTitle>
            <DialogDescription>{t('app.about.subtitle')}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogClose asChild>
          <Button variant="ghost" size="icon" aria-label={t('app.common.close')} className="text-muted-foreground absolute top-3 right-3 size-8 rounded-lg">
            <X className="size-4" />
          </Button>
        </DialogClose>

        <div className="text-muted-foreground space-y-3 text-[13.5px] leading-relaxed">
          <p>{t('app.about.intro1')}</p>
          <p>
            <Trans k="app.about.intro2" tags={{ a: sondehubLink }} />
          </p>
          <button
            type="button"
            onClick={() => {
              useStore.getState().setSettings({ tutorialDone: false });
              onClose();
            }}
            className={`${linkCls} inline-flex items-center gap-1.5 rounded-sm text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
          >
            <RotateCcw className="size-3.5" />
            {t('app.common.replayIntro')}
          </button>
        </div>

        <section className="mt-5">
          <Heading>{t('app.about.faq.heading')}</Heading>
          <Accordion type="single" collapsible className="border-soft rounded-xl border px-3">
            {FAQ.map(([q, a], i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-soft">
                <AccordionTrigger className="py-2.5 text-[13.5px] hover:no-underline">{t(q)}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-[13px] leading-relaxed">
                  <Trans k={a} tags={{ a: sondehubLink }} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="mt-5">
          <Heading>{t('app.about.legend.heading')}</Heading>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
            {LEGEND.map(([id, label]) => (
              <div key={id} className="flex min-w-0 items-center gap-2.5">
                <span className="bg-chip grid size-8 shrink-0 place-items-center rounded-lg">
                  <MapIcon id={id} size={22} />
                </span>
                <span className="min-w-0 leading-tight">{label()}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <Heading>{t('app.about.shortcuts.heading')}</Heading>
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {SHORTCUTS.map(([id, key, label]) => (
              <div key={id} className="text-muted-foreground grid grid-cols-[3.75rem_1fr] items-center gap-1">
                <Kbd className="bg-chip text-foreground justify-self-start tabular">{key()}</Kbd>
                {label()}
              </div>
            ))}
          </div>
        </section>

        <Separator className="my-4" />

        <p className="text-muted-foreground text-xs leading-relaxed">{t('app.about.credits')}</p>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          <Trans k="app.about.source" tags={{ a: githubLink }} />
        </p>
      </DialogContent>
    </Dialog>
  );
}
