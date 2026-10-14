import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { fr } from './fr';
import { isLocale, LOCALES, type Locale } from './locales';

export { LOCALES, type Locale } from './locales';

type Dict = typeof fr;
type Key = keyof Dict;
type PluralBase<K> = K extends `${infer B}_other` ? B : never;
export type TKey = Key | PluralBase<Key>;
export type TParams = Record<string, string | number>;

const STORAGE_KEY = 'sondehubv2.locale';
const FR = fr as Record<string, string>;
const FR_RULES = new Intl.PluralRules('fr-FR');
const loaders = import.meta.glob<Record<string, string>>('./locales/*.json', { import: 'default' });

let current: Locale = 'fr';
let dict: Record<string, string> = FR;
let rules = new Intl.PluralRules('fr-FR');
let countFormat = new Intl.NumberFormat('fr-FR');
const listeners = new Set<() => void>();
const bound = new Map<Locale, typeof t>();

function lookup(key: string): string | undefined {
  return dict[key] ?? FR[key];
}

function interpolate(s: string, params: TParams): string {
  return s.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    if (v === undefined) return m;
    if (name === 'count' && typeof v === 'number') return countFormat.format(v);
    return String(v);
  });
}

export function t(key: TKey, params?: TParams): string {
  let s: string | undefined;
  if (params && typeof params.count === 'number') {
    s = dict[`${key}_${rules.select(params.count)}`] ?? dict[`${key}_other`] ?? FR[`${key}_${FR_RULES.select(params.count)}`] ?? FR[`${key}_other`];
  }
  s ??= lookup(key) ?? key;
  return params ? interpolate(s, params) : s;
}

export function getLocale(): Locale {
  return current;
}

export function intlTag(): string {
  return LOCALES.find((l) => l.code === current)!.intl;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

export function useT(): typeof t {
  const locale = useLocale();
  let fn = bound.get(locale);
  if (!fn) {
    fn = (key, params) => t(key, params);
    bound.set(locale, fn);
  }
  return fn;
}

async function load(locale: Locale): Promise<Record<string, string>> {
  if (locale === 'fr') return FR;
  const loader = loaders[`./locales/${locale}.json`];
  return loader ? loader() : FR;
}

function apply(locale: Locale, d: Record<string, string>) {
  current = locale;
  dict = d;
  const tag = intlTag();
  rules = new Intl.PluralRules(tag);
  countFormat = new Intl.NumberFormat(tag);
  document.documentElement.lang = locale;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
}

export async function setLocale(locale: Locale): Promise<void> {
  const d = await load(locale);
  apply(locale, d);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    void 0;
  }
  listeners.forEach((l) => l());
}

function detect(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    void 0;
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.toLowerCase().split('-')[0];
    if (isLocale(code)) return code;
  }
  return 'en';
}

export async function initI18n(): Promise<void> {
  const locale = detect();
  try {
    apply(locale, await load(locale));
  } catch {
    apply('fr', FR);
  }
}

const TAG = /<(\w+)>([\s\S]*?)<\/\1>/g;

export function renderRich(text: string, tags: Record<string, (chunk: ReactNode) => ReactNode>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TAG)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = tags[m[1]];
    out.push(createElement(Fragment, { key: i++ }, render ? render(m[2]) : m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Trans({ k, params, tags = {} }: { k: TKey; params?: TParams; tags?: Record<string, (chunk: ReactNode) => ReactNode> }) {
  useLocale();
  return createElement(Fragment, null, ...renderRich(t(k, params), tags));
}
