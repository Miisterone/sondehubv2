export const LOCALES = [
  { code: 'fr', name: 'Français', intl: 'fr-FR', flag: 'FR' },
  { code: 'en', name: 'English', intl: 'en-GB', flag: 'GB' },
  { code: 'de', name: 'Deutsch', intl: 'de-DE', flag: 'DE' },
  { code: 'es', name: 'Español', intl: 'es-ES', flag: 'ES' },
  { code: 'it', name: 'Italiano', intl: 'it-IT', flag: 'IT' },
  { code: 'nl', name: 'Nederlands', intl: 'nl-NL', flag: 'NL' },
  { code: 'pl', name: 'Polski', intl: 'pl-PL', flag: 'PL' },
  { code: 'cs', name: 'Čeština', intl: 'cs-CZ', flag: 'CZ' },
  { code: 'pt', name: 'Português', intl: 'pt-PT', flag: 'PT' },
  { code: 'sv', name: 'Svenska', intl: 'sv-SE', flag: 'SE' },
  { code: 'ja', name: '日本語', intl: 'ja-JP', flag: 'JP' },
  { code: 'zh', name: '中文', intl: 'zh-CN', flag: 'CN' },
  { code: 'ru', name: 'Русский', intl: 'ru-RU', flag: 'RU' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

export const LOCALE_CODES = LOCALES.map((l) => l.code) as Locale[];

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALE_CODES as string[]).includes(v);
}
