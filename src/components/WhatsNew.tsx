import { Megaphone } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStore } from '@/store/useStore';
import { TAB_EVENT, type SidebarTab } from '@/lib/tour';
import { WHATS_NEW, groupByDate, setWhatsNewOpen, unreadIds, useWhatsNew, type WhatsNewItem, type WhatsNewRun } from '@/lib/whatsNew';
import { intlTag, useT } from '@/i18n';
import { Icon3D } from './Icon3D';

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();
const GROUPS = groupByDate(WHATS_NEW);
let leaving = false;

function run(action: WhatsNewRun) {
  const st = useStore.getState();
  leaving = true;
  setWhatsNewOpen(false);
  if (action === 'terrain') st.setSettings({ terrain: true });
  else if (action === 'tour') st.setSettings({ tutorialDone: false });
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

export function WhatsNew() {
  const t = useT();
  const { open, seen, fresh } = useWhatsNew();
  const unread = unreadIds(seen).length;
  const title = t('app.whatsNew.title');
  const label = unread > 0 ? `${title}, ${t('app.whatsNew.unread', { count: unread })}` : title;
  const tag = intlTag();
  const partial = fresh.size < WHATS_NEW.length;

  return (
    <Popover open={open} onOpenChange={setWhatsNewOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger
            data-tour="whats-new"
            aria-label={label}
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground relative inline-flex size-9 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Megaphone className="size-[18px]" />
            {unread > 0 && <span aria-hidden className="bg-primary ring-background absolute top-2 right-2 size-2 rounded-full ring-2" />}
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={12}
        onEscapeKeyDown={keepSelection}
        onCloseAutoFocus={(e) => {
          if (!leaving) return;
          leaving = false;
          e.preventDefault();
        }}
        className="scroll-thin max-h-[min(72dvh,600px)] w-[360px] max-w-[calc(100vw-24px)] overflow-y-auto p-0"
      >
        <div className="border-b px-5 pt-4 pb-3.5">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">{t('app.whatsNew.intro')}</p>
        </div>
        {GROUPS.map((g) => (
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
        ))}
      </PopoverContent>
    </Popover>
  );
}
