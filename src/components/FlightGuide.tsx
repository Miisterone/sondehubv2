import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t as translate, Trans, useT } from '@/i18n';
import { cx } from './ui';
import { Icon3D, type Icon3DId } from './Icon3D';

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

const STEPS: { icon: Icon3DId; title: string; text: string }[] = [
  {
    icon: 'ascending',
    get title() {
      return translate('sidebar.guide.ascentTitle');
    },
    get text() {
      return translate('sidebar.guide.ascentText');
    },
  },
  {
    icon: 'burst',
    get title() {
      return translate('sidebar.guide.burstTitle');
    },
    get text() {
      return translate('sidebar.guide.burstText');
    },
  },
  {
    icon: 'descending',
    get title() {
      return translate('sidebar.guide.descentTitle');
    },
    get text() {
      return translate('sidebar.guide.descentText');
    },
  },
  {
    icon: 'landed',
    get title() {
      return translate('sidebar.guide.landedTitle');
    },
    get text() {
      return translate('sidebar.guide.landedText');
    },
  },
];

export function FlightGuide({ className }: { className?: string }) {
  const t = useT();
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
          {t('sidebar.guide.trigger')}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" collisionPadding={12} className="w-[320px] p-5" onEscapeKeyDown={keepSelection}>
        <h2 className="text-[16px] font-semibold">{t('sidebar.guide.title')}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed">
          {t('sidebar.guide.intro')}
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
            <Trans k="sidebar.guide.lost" tags={{ b: (c) => <span className="text-foreground font-semibold">{c}</span> }} />
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
