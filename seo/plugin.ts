import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { LOCALES, type Locale } from '../src/i18n/locales';
import { fr } from '../src/i18n/fr';
import { SEO_TEXT } from './content';

export const SITE_URL = 'https://sondehubv2.vercel.app';
const SITE_NAME = 'SondeHub V2';
const DEFAULT_LOCALE: Locale = 'en';
const OG_IMAGE = { path: '/og-image.png', width: 1200, height: 630 };
const LOCALE_DIR = path.resolve(import.meta.dirname, '../src/i18n/locales');

interface Page {
  locale: Locale;
  prefixed: boolean;
  url: string;
  title: string;
  description: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ogLocale = (code: Locale) => LOCALES.find((l) => l.code === code)!.intl.replace('-', '_');
const localeUrl = (code: Locale) => `${SITE_URL}/${code}/`;

function dictionary(code: Locale): Record<string, string> {
  if (code === 'fr') return fr as Record<string, string>;
  return JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, `${code}.json`), 'utf8')) as Record<string, string>;
}

function page(locale: Locale, prefixed: boolean): Page {
  const dict = dictionary(locale);
  const base = fr as Record<string, string>;
  return {
    locale,
    prefixed,
    url: prefixed ? localeUrl(locale) : `${SITE_URL}/`,
    title: dict['app.title'] ?? base['app.title'],
    description: dict['app.description'] ?? base['app.description'],
  };
}

function alternates(): string[] {
  return [
    ...LOCALES.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${localeUrl(l.code)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`,
  ];
}

function jsonLd(p: Page): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: p.url,
    description: p.description,
    inLanguage: p.prefixed ? p.locale : LOCALES.map((l) => l.code),
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Requires JavaScript and WebGL',
    image: `${SITE_URL}${OG_IMAGE.path}`,
    isBasedOn: 'https://sondehub.org',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function head(p: Page): string {
  const image = `${SITE_URL}${OG_IMAGE.path}`;
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${p.url}" />`,
    ...alternates(),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${p.url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${esc(p.title)}" />`,
    `<meta property="og:locale" content="${ogLocale(p.locale)}" />`,
    ...LOCALES.filter((l) => l.code !== p.locale).map((l) => `<meta property="og:locale:alternate" content="${ogLocale(l.code)}" />`),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    jsonLd(p),
  ].join('\n    ');
}

function splash(p: Page): string {
  const text = SEO_TEXT[p.locale];
  const links = LOCALES.map(
    (l) =>
      `<li><a href="/${l.code}/" hreflang="${l.code}" lang="${l.code}"${l.code === p.locale && p.prefixed ? ' aria-current="page"' : ''}>${esc(l.name)}</a></li>`,
  ).join('');
  return [
    `<main class="seo-splash">`,
    `<h1>${esc(p.title)}</h1>`,
    `<p>${esc(text.body)}</p>`,
    `<p class="seo-splash-note">${esc(text.loading)}</p>`,
    `<nav aria-label="${esc(text.languages)}"><ul>${links}</ul></nav>`,
    `</main>`,
  ].join('');
}

const SPLASH_STYLE = `<style>
      .seo-splash { box-sizing: border-box; max-width: 40rem; margin: 0 auto; padding: 18vh 24px 32px; font-family: 'Open Sans Variable', system-ui, sans-serif; color: var(--text, #425466); line-height: 1.6; }
      .seo-splash h1 { margin: 0 0 16px; font: 600 28px/1.25 'Atkinson Hyperlegible', system-ui, sans-serif; color: var(--foreground, #0a0a0a); }
      .seo-splash p { margin: 0 0 16px; font-size: 15px; }
      .seo-splash-note { opacity: 0.8; }
      .seo-splash ul { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 24px 0 0; padding: 16px 0 0; list-style: none; border-top: 1px solid var(--border, #e6e8eb); font-size: 13px; }
      .seo-splash a { color: inherit; text-decoration: none; }
      .seo-splash a:hover, .seo-splash a[aria-current] { color: var(--primary, #1362fb); }
    </style>`;

function render(html: string, p: Page): string {
  return html
    .replace(/<html lang="[^"]*"/, `<html lang="${p.locale}"`)
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<meta name="description"[^>]*>\s*/, '')
    .replace('<!--seo-head-->', `${head(p)}\n    ${SPLASH_STYLE}`)
    .replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${splash(p)}</div>`);
}

function sitemap(): string {
  const today = new Date().toISOString().slice(0, 10);
  const links = alternates()
    .map((l) => l.replace('<link rel="alternate"', '<xhtml:link rel="alternate"'))
    .join('\n    ');
  const urls = [`${SITE_URL}/`, ...LOCALES.map((l) => localeUrl(l.code))].map(
    (loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    ${links}\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

export function seo(): Plugin {
  let template = '';
  return {
    name: 'seo-pages',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => {
        template = html;
        return render(html, page(DEFAULT_LOCALE, false));
      },
    },
    generateBundle: {
      order: 'post',
      handler() {
        if (!template) return;
        for (const l of LOCALES) {
          this.emitFile({ type: 'asset', fileName: `${l.code}/index.html`, source: render(template, page(l.code, true)) });
        }
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() });
      },
    },
  };
}
