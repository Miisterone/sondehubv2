import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LocateFixed, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cx } from '@/components/ui';
import { Icon3D } from '@/components/Icon3D';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';

/** Window event asking the sidebar to switch to its "Près de moi" mode. */
const NEARBY_EVENT = 'sondehubv2:nearby';
/** Grace period after the first data load, so the card doesn't flash in while the map settles. */
const SHOW_DELAY_MS = 1000;
const LEAVE_MS = 160;

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent,
  );

/** Touch-first devices have no keyboard shortcut to advertise. */
const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

function Tip({ icon, bare, children }: { icon: ReactNode; bare?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 md:gap-3">
      <span className={cx('grid size-8 shrink-0 place-items-center md:size-9', !bare && 'bg-chip rounded-xl')}>{icon}</span>
      <span className="min-w-0 leading-snug">{children}</span>
    </li>
  );
}

/**
 * First-visit introduction: a non-blocking floating card over the map.
 * Dismissed for good (settings.onboarded) by its buttons, Escape, or selecting a sonde.
 */
export function WelcomeCard() {
  const onboarded = useStore((s) => s.settings.onboarded);
  const loading = useStore((s) => s.loading);
  const selected = useStore((s) => s.selected);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Wait for the first telemetry load (plus a beat) before showing anything.
  useEffect(() => {
    if (ready || loading) return;
    const t = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [ready, loading]);

  const visible = ready && !onboarded;

  // Reset the exit animation when the card is shown again ("Revoir l'introduction").
  useEffect(() => {
    if (visible) setLeaving(false);
  }, [visible]);

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => useStore.getState().setSettings({ onboarded: true }), LEAVE_MS);
  }, []);

  // Picking a sonde means the user found their way: get out of the way.
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
      // Escape closes the open sonde panel first (handled by App).
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

  return (
    <div
      className={cx(
        'pointer-events-none fixed z-30 flex justify-center',
        // Mobile: under the safe area, clear of the map controls column and the bottom sheet.
        'top-[calc(env(safe-area-inset-top,0px)+0.75rem)] right-16 left-3',
        // Desktop: bottom-centre of the map area, right of the 380px sidebar.
        'md:top-auto md:right-6 md:bottom-6 md:left-[calc(380px+1.5rem)]',
      )}
    >
      <section
        role="region"
        aria-label="Bienvenue sur SondeHub V2"
        className={cx(
          'glass animate-in pointer-events-auto relative w-full max-w-[440px] rounded-lg p-3.5 text-[12.5px] md:p-5 md:text-[13px] transition-[opacity,transform] duration-150',
          leaving && 'translate-y-1 opacity-0',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fermer l’introduction"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground absolute top-2 right-2 size-8 rounded-lg"
        >
          <X className="size-4" />
        </Button>

        <h2 className="pr-8 text-[14.5px] font-semibold tracking-tight md:text-[15px]">Bienvenue sur SondeHub V2</h2>
        <p className="text-muted-foreground mt-1 leading-snug md:mt-1.5 md:leading-relaxed">
          Les radiosondes sont de petits capteurs lâchés sous des ballons météo, environ deux fois par jour, par les services météorologiques. Elles
          montent au-delà de 30 km puis retombent en parachute&nbsp;; des radioamateurs les suivent ici en direct.
        </p>

        <ul className="mt-3 space-y-2 md:mt-3.5 md:space-y-2.5">
          <Tip bare icon={<Icon3D id="descending" size={40} />}>
            {isTouch ? 'Touchez' : 'Cliquez sur'} un ballon pour voir sa trajectoire, ses mesures et son point d’atterrissage prévu.
          </Tip>
          <Tip bare icon={<Icon3D id="landing" size={40} />}>Activez votre position pour voir ce qui atterrit près de chez vous et être alerté.</Tip>
          {isTouch ? (
            <Tip icon={<Search className="text-muted-foreground size-4" />}>Touchez la loupe pour rechercher une sonde, une station ou un site.</Tip>
          ) : (
            <Tip icon={<Search className="text-muted-foreground size-4" />}>
              <Kbd className="bg-chip text-foreground tabular">{isMac ? '⌘K' : 'Ctrl K'}</Kbd> pour tout rechercher : sondes, stations, sites, actions.
            </Tip>
          )}
        </ul>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 md:mt-4">
          <Button variant="ghost" size="sm" onClick={dismiss} className="rounded-xl">
            Découvrir
          </Button>
          <Button size="sm" onClick={locate} className="rounded-xl">
            <LocateFixed className="size-4" />
            Me localiser
          </Button>
        </div>
      </section>
    </div>
  );
}
