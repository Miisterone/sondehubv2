import { Check } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { CN, CZ, DE, ES, FR, GB, IT, JP, NL, PL, PT, RU, SE } from 'country-flag-icons/react/3x2';
import { LOCALES, setLocale, useLocale, useT, type Locale } from '@/i18n';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cx } from './ui';

const FLAGS: Record<Locale, typeof FR> = { fr: FR, en: GB, de: DE, es: ES, it: IT, nl: NL, pl: PL, cs: CZ, pt: PT, sv: SE, ja: JP, zh: CN, ru: RU };

function FlagIcon({ locale, className }: { locale: Locale; className?: string }) {
  const Icon = FLAGS[locale];
  return <Icon aria-hidden className={cx('h-[14px] w-[21px] shrink-0 rounded-[2px] border border-black/10', className)} />;
}

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

export function LanguageSelect({ side = 'bottom' }: { side?: 'left' | 'right' | 'top' | 'bottom' }) {
  const t = useT();
  const locale = useLocale();
  const currentName = LOCALES.find((l) => l.code === locale)!.name;
  const label = t('app.languageCurrent', { name: currentName });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label={label}
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-9 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-[3px]"
          >
            <FlagIcon locale={locale} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={side}>{t('app.languageChoose')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-h-[min(70vh,480px)] w-52 overflow-y-auto" onEscapeKeyDown={keepSelection}>
        <DropdownMenuLabel className="text-muted-foreground text-[12px] font-normal">{t('app.language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => void setLocale(v as Locale)}>
          {LOCALES.map((l) => (
            <DropdownMenuPrimitive.RadioItem
              key={l.code}
              value={l.code}
              lang={l.code}
              className="focus:bg-accent focus:text-accent-foreground flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13.5px] outline-hidden select-none"
            >
              <FlagIcon locale={l.code} />
              <span className="flex-1">{l.name}</span>
              <DropdownMenuPrimitive.ItemIndicator>
                <Check className="text-primary size-4" />
              </DropdownMenuPrimitive.ItemIndicator>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
