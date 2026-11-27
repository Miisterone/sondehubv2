import { useMemo, useState, useSyncExternalStore } from 'react';
import { Search, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT, type TKey } from '@/i18n';

const TERMS = [
  'radiosonde',
  'burst',
  'ascentRate',
  'prediction',
  'receiver',
  'utc',
  'hpa',
  'dewPoint',
  'freezing',
  'lcl',
  'tropopause',
  'skewt',
  'cape',
  'shear',
] as const;

let open = false;
const listeners = new Set<() => void>();

export function setGlossaryOpen(next: boolean) {
  if (next === open) return;
  open = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function Glossary() {
  const t = useT();
  const isOpen = useSyncExternalStore(subscribe, () => open, () => open);
  const [query, setQuery] = useState('');
  const entries = useMemo(
    () =>
      TERMS.map((id) => ({ id, term: t(`app.glossary.${id}.term` as TKey), text: t(`app.glossary.${id}.text` as TKey) })).sort((a, b) => a.term.localeCompare(b.term)),
    [t],
  );
  const q = fold(query.trim());
  const shown = q ? entries.filter((e) => fold(`${e.term} ${e.text}`).includes(q)) : entries;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        setGlossaryOpen(o);
        if (!o) setQuery('');
      }}
    >
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 rounded-lg p-0 sm:max-w-lg">
        <div className="shrink-0 border-b px-5 pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[17px] font-semibold">{t('app.glossary.title')}</DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-relaxed">{t('app.glossary.intro')}</DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label={t('app.common.close')} className="text-muted-foreground -mt-1 -mr-2 size-9 rounded-md">
                <X className="size-[18px]" />
              </Button>
            </DialogClose>
          </div>
          <div className="relative mt-3">
            <Search className="text-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('app.glossary.search')}
              aria-label={t('app.glossary.search')}
              className="h-9 rounded-md pl-9 text-[14px] [&::-webkit-search-cancel-button]:appearance-none"
            />
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {shown.length === 0 ? (
            <p className="py-6 text-[13.5px]">{t('app.glossary.empty')}</p>
          ) : (
            <dl className="divide-y">
              {shown.map((e) => (
                <div key={e.id} className="py-3.5">
                  <dt className="font-heading text-foreground text-[14px] font-semibold">{e.term}</dt>
                  <dd className="text-muted-foreground mt-1 text-[13.5px] leading-relaxed">{e.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
