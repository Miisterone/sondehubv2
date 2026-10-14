import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from 'cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t, useT } from '@/i18n';

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
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('app.helpHint.ariaLabel', { title })}
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
    get title() {
      return t('app.help.burst.title');
    },
    get text() {
      return t('app.help.burst.text');
    },
  },
  maxAlt: {
    get title() {
      return t('app.help.maxAlt.title');
    },
    get text() {
      return t('app.help.maxAlt.text');
    },
  },
  prediction: {
    get title() {
      return t('app.help.prediction.title');
    },
    get text() {
      return t('app.help.prediction.text');
    },
  },
  landing: {
    get title() {
      return t('app.help.landing.title');
    },
    get text() {
      return t('app.help.landing.text');
    },
  },
  lost: {
    get title() {
      return t('app.help.lost.title');
    },
    get text() {
      return t('app.help.lost.text');
    },
  },
  rate: {
    get title() {
      return t('app.help.rate.title');
    },
    get text() {
      return t('app.help.rate.text');
    },
  },
  vspeed: {
    get title() {
      return t('app.help.vspeed.title');
    },
    get text() {
      return t('app.help.vspeed.text');
    },
  },
  hspeed: {
    get title() {
      return t('app.help.hspeed.title');
    },
    get text() {
      return t('app.help.hspeed.text');
    },
  },
  trajectory: {
    get title() {
      return t('app.help.trajectory.title');
    },
    get text() {
      return t('app.help.trajectory.text');
    },
  },
  sensors: {
    get title() {
      return t('app.help.sensors.title');
    },
    get text() {
      return t('app.help.sensors.text');
    },
  },
  profile: {
    get title() {
      return t('app.help.profile.title');
    },
    get text() {
      return t('app.help.profile.text');
    },
  },
  snr: {
    get title() {
      return t('app.help.snr.title');
    },
    get text() {
      return t('app.help.snr.text');
    },
  },
  elevation: {
    get title() {
      return t('app.help.elevation.title');
    },
    get text() {
      return t('app.help.elevation.text');
    },
  },
  receivers: {
    get title() {
      return t('app.help.receivers.title');
    },
    get text() {
      return t('app.help.receivers.text');
    },
  },
} satisfies Record<string, { title: string; text: string }>;
