import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cx } from '@/components/ui';
import { Icon3D, type Icon3DId } from '@/components/Icon3D';
import { LanguageSelect } from '@/components/LanguageSelect';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';
import { Trans, useT } from '@/i18n';

const NEARBY_EVENT = 'sondehubv2:nearby';
const SHOW_DELAY_MS = 1000;
const LEAVE_MS = 160;

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent,
  );

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

type Step = { icon: Icon3DId; title: string; body: ReactNode };

export function WelcomeCard() {
  const t = useT();
  const tutorialDone = useStore((s) => s.settings.tutorialDone);
  const loading = useStore((s) => s.loading);
  const selected = useStore((s) => s.selected);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (ready || loading) return;
    const id = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [ready, loading]);

  const visible = ready && !tutorialDone;

  useEffect(() => {
    if (!visible) return;
    setLeaving(false);
    setStep(0);
  }, [visible]);

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => useStore.getState().setSettings({ tutorialDone: true }), LEAVE_MS);
  }, []);

  const prevSelected = useRef(selected);
  useEffect(() => {
    if (visible && selected && selected !== prevSelected.current) dismiss();
    prevSelected.current = selected;
  }, [visible, selected, dismiss]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (useStore.getState().selected) return;
      dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  const locate = () => {
    dismiss();
    void locateUser({ fly: true }).then((ok) => {
      if (ok) window.dispatchEvent(new Event(NEARBY_EVENT));
    });
  };

  const steps: Step[] = [
    {
      icon: 'launch',
      title: t('app.welcome.title'),
      body: (
        <>
          <p>{t('app.welcome.text')}</p>
          <div className="mt-3">
            <span className="text-foreground mb-1.5 block text-[12px] font-semibold">{t('app.tour.languageLabel')}</span>
            <LanguageSelect variant="field" />
          </div>
        </>
      ),
    },
    {
      icon: 'descending',
      title: t('app.tour.mapTitle'),
      body: <p>{t(isTouch ? 'app.welcome.tipSondeTouch' : 'app.welcome.tipSondeClick')}</p>,
    },
    {
      icon: 'ascending',
      title: t('app.tour.listsTitle'),
      body: (
        <>
          <p>
            {t('app.tour.listsText', {
              nearby: t('sidebar.tabs.nearby'),
              flying: t('sidebar.tabs.flying'),
              following: t('sidebar.tabs.following'),
            })}
          </p>
          <p className="mt-2">
            {isTouch ? (
              t('app.welcome.tipSearchTouch')
            ) : (
              <Trans
                k="app.welcome.tipSearchKey"
                params={{ shortcut: isMac ? '⌘K' : t('app.key.ctrlK') }}
                tags={{ kbd: (c) => <Kbd className="bg-chip text-foreground tabular">{c}</Kbd> }}
              />
            )}
          </p>
        </>
      ),
    },
    {
      icon: 'locate',
      title: t('app.tour.alertsTitle'),
      body: <p>{t('app.welcome.tipLocate')}</p>,
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div
      className={cx(
        'pointer-events-none fixed z-30 flex justify-center',
        'top-[calc(env(safe-area-inset-top,0px)+0.75rem)] right-16 left-3',
        'md:top-auto md:right-6 md:bottom-6 md:left-[calc(380px+1.5rem)]',
      )}
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className={cx(
          'glass animate-in pointer-events-auto relative w-full max-w-[440px] rounded-lg p-4 text-[12.5px] md:p-5 md:text-[13px] transition-[opacity,transform] duration-150',
          leaving && 'translate-y-1 opacity-0',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('app.welcome.close')}
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground absolute top-2 right-2 size-8 rounded-md"
        >
          <X className="size-4" />
        </Button>

        <div className="flex items-start gap-3 pr-8">
          <Icon3D id={current.icon} size={40} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11.5px] tabular" aria-live="polite">
              {t('app.tour.step', { current: step + 1, total: steps.length })}
            </p>
            <h2 id="tour-title" className="font-heading text-foreground text-[15px] font-semibold tracking-tight md:text-[16px]">
              {current.title}
            </h2>
          </div>
        </div>

        <div key={step} className="animate-in text-muted-foreground mt-2.5 leading-relaxed">
          {current.body}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto flex items-center gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cx('h-1.5 rounded-full transition-[width,background-color]', i === step ? 'bg-primary w-4' : 'bg-chip w-1.5')} />
            ))}
          </div>
          {!last && (
            <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground rounded-md">
              {t('app.tour.skip')}
            </Button>
          )}
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="rounded-md shadow-none">
              {t('app.tour.prev')}
            </Button>
          )}
          {last ? (
            <>
              <Button variant="outline" size="sm" onClick={dismiss} className="rounded-md shadow-none">
                {t('app.tour.done')}
              </Button>
              <Button size="sm" onClick={locate} className="rounded-md">
                {t('app.common.locateMe')}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setStep(step + 1)} className="rounded-md">
              {t('app.tour.next')}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
