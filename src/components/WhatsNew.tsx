import type { ReactNode } from 'react';
import { Megaphone, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStore } from '@/store/useStore';
import { TAB_EVENT, type SidebarTab } from '@/lib/tour';
import { WHATS_NEW, groupByDate, setWhatsNewOpen, unreadIds, useWhatsNew, type WhatsNewItem, type WhatsNewRun } from '@/lib/whatsNew';
import { useIsMobile } from '@/lib/useIsMobile';
import { intlTag, useT } from '@/i18n';
import { Icon3D } from './Icon3D';
import { setGlossaryOpen } from './Glossary';

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();
const GROUPS = groupByDate(WHATS_NEW);
let leaving = false;

function run(action: WhatsNewRun) {
  const st = useStore.getState();
  leaving = true;
  setWhatsNewOpen(false);
  if (action === 'terrain') st.setSettings({ terrain: true });
  else if (action === 'tour') st.setSettings({ tutorialDone: false });
  else if (action === 'glossary') setGlossaryOpen(true);
  else window.dispatchEvent(new CustomEvent<SidebarTab>(TAB_EVENT, { detail: action }));
}

export function openWhatsNew() {
  const st = useStore.getState();
  st.select(null);
  st.selectSite(null);
  st.selectListener(null);
  setWhatsNewOpen(true);
}

function formatDay(iso: string, tag: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
}

function Entry({ item, fresh }: { item: WhatsNewItem; fresh: boolean }) {
  const t = useT();
  const terrain = useStore((s) => s.settings.terrain);
  const action = item.action && !(item.action.run === 'terrain' && terrain) ? item.action : null;
  return (
    <li className="flex gap-3">
      <span className="-my-1 grid size-10 shrink-0 place-items-center">
        <Icon3D id={item.icon} size={40} />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-snug font-semibold">
          {t(item.title)}
          {fresh && <span className="bg-primary/10 text-primary rounded-sm px-1.5 font-sans text-[11px] leading-[18px] font-semibold">{t('app.whatsNew.badge')}</span>}
        </h4>
        <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">{t(item.text)}</p>
        {action && (
          <button
            type="button"
            onClick={() => run(action.run)}
            className="text-primary focus-visible:ring-ring mt-1 -ml-1 rounded-sm px-1 text-[13px] font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
          >
            {t(action.label)}
          </button>
        )}
      </div>
    </li>
  );
}

const TRIGGER =
  'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground relative inline-flex size-9 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function keepFocus(e: Event) {
  if (!leaving) return;
  leaving = false;
  e.preventDefault();
}

function Groups({ fresh }: { fresh: ReadonlySet<string> }) {
  const tag = intlTag();
  const partial = fresh.size < WHATS_NEW.length;
  return GROUPS.map((g) => (
    <section key={g.date} className="border-b px-5 pt-3.5 pb-4 last:border-b-0">
      <h3 className="text-faint mb-3 font-sans text-[12px] font-medium">
        <time dateTime={g.date}>{formatDay(g.date, tag)}</time>
      </h3>
      <ul className="space-y-4">
        {g.items.map((it) => (
          <Entry key={it.id} item={it} fresh={partial && fresh.has(it.id)} />
        ))}
      </ul>
    </section>
  ));
}

export function WhatsNew() {
  const t = useT();
  const isMobile = useIsMobile();
  const { open, seen, fresh } = useWhatsNew();
  const unread = unreadIds(seen).length;
  const title = t('app.whatsNew.title');
  const label = unread > 0 ? `${title}, ${t('app.whatsNew.unread', { count: unread })}` : title;
  const icon: ReactNode = (
    <>
      <Megaphone className="size-[18px]" />
      {unread > 0 && <span aria-hidden className="bg-primary ring-background absolute top-2 right-2 size-2 rounded-full ring-2" />}
    </>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setWhatsNewOpen}>
        <DialogTrigger data-tour="whats-new" aria-label={label} className={TRIGGER}>
          {icon}
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={keepSelection}
          onCloseAutoFocus={keepFocus}
          className="top-auto bottom-0 left-0 flex max-h-[88dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-lg rounded-b-none border-x-0 border-b-0 p-0 shadow-none data-[state=closed]:zoom-out-100 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-bottom-4"
        >
          <div className="flex shrink-0 items-start gap-3 border-b py-3 pr-3 pl-5">
            <div className="min-w-0 flex-1 pt-1">
              <DialogTitle className="text-[16px] font-semibold">{title}</DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-relaxed">{t('app.whatsNew.intro')}</DialogDescription>
            </div>
            <DialogClose aria-label={t('app.common.close')} className={TRIGGER}>
              <X className="size-[18px]" />
            </DialogClose>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <Groups fresh={fresh} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setWhatsNewOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger data-tour="whats-new" aria-label={label} className={TRIGGER}>
            {icon}
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={12}
        onEscapeKeyDown={keepSelection}
        onCloseAutoFocus={keepFocus}
        className="scroll-thin max-h-[min(var(--radix-popover-content-available-height),600px)] w-[360px] max-w-[calc(100vw-24px)] overflow-y-auto p-0"
      >
        <div className="border-b px-5 pt-4 pb-3.5">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">{t('app.whatsNew.intro')}</p>
        </div>
        <Groups fresh={fresh} />
      </PopoverContent>
    </Popover>
  );
}
