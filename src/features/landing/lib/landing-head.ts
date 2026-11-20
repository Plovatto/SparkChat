import { HTML_LANG, LANGUAGE_PATHS, OG_LOCALE, type Language } from '../../../lib/i18n/language';

export const SITE_URL = 'https://sparkchat.plovatto.dev';
const SHARE_IMAGE = `${SITE_URL}/og-image.jpg`;

export const LANDING_HEAD_PLACEHOLDER = '<meta name="sc-landing-head" />';
export const LANDING_BOOT_PLACEHOLDER = '<script id="sc-landing-boot"></script>';
const HTML_TAG = /<html lang="[^"]*">/;
const MANIFEST_LINK = /<link rel="manifest" href="[^"]*" \/>/;
const MANIFEST_HREF: Record<Language, string> = { pt: '/manifest.webmanifest', en: '/manifest.en.webmanifest' };

export interface LandingHeadCopy {
  meta: {
    title: string;
    description: string;
    imageAlt: string;
    browserRequirements: string;
    featureList: Record<string, string>;
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function pageUrl(language: Language): string {
  return `${SITE_URL}${LANGUAGE_PATHS[language]}`;
}

export function landingStructuredData(language: Language, copy: LandingHeadCopy) {
  const url = pageUrl(language);
  const { meta } = copy;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'SparkChat',
        description: meta.description,
        inLanguage: [HTML_LANG.pt, HTML_LANG.en],
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: 'SparkChat',
        url,
        description: meta.description,
        applicationCategory: 'CommunicationApplication',
        operatingSystem: 'Web',
        browserRequirements: meta.browserRequirements,
        inLanguage: HTML_LANG[language],
        image: SHARE_IMAGE,
        screenshot: SHARE_IMAGE,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
        featureList: Object.values(meta.featureList),
        author: { '@type': 'Person', name: 'Plovatto', url: 'https://plovatto.dev/' },
        sameAs: 'https://github.com/Plovatto/SparkChat',
      },
    ],
  };
}

export function renderLandingHead(language: Language, copy: LandingHeadCopy): string {
  const { meta } = copy;
  const other: Language = language === 'pt' ? 'en' : 'pt';
  const url = pageUrl(language);
  const tag = (attribute: 'name' | 'property', key: string, value: string) => `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
  const jsonLd = JSON.stringify(landingStructuredData(language, copy)).replaceAll('<', '\\u003c');

  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    tag('name', 'description', meta.description),
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="${HTML_LANG.pt}" href="${pageUrl('pt')}" />`,
    `<link rel="alternate" hreflang="${HTML_LANG.en}" href="${pageUrl('en')}" />`,
    `<link rel="alternate" hreflang="x-default" href="${pageUrl('en')}" />`,
    tag('property', 'og:type', 'website'),
    tag('property', 'og:site_name', 'SparkChat'),
    tag('property', 'og:locale', OG_LOCALE[language]),
    tag('property', 'og:locale:alternate', OG_LOCALE[other]),
    tag('property', 'og:url', url),
    tag('property', 'og:title', meta.title),
    tag('property', 'og:description', meta.description),
    tag('property', 'og:image', SHARE_IMAGE),
    tag('property', 'og:image:secure_url', SHARE_IMAGE),
    tag('property', 'og:image:type', 'image/jpeg'),
    tag('property', 'og:image:width', '1200'),
    tag('property', 'og:image:height', '630'),
    tag('property', 'og:image:alt', meta.imageAlt),
    tag('name', 'twitter:card', 'summary_large_image'),
    tag('name', 'twitter:title', meta.title),
    tag('name', 'twitter:description', meta.description),
    tag('name', 'twitter:image', SHARE_IMAGE),
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join('\n    ');
}

export function renderLandingDocument(template: string, language: Language, copy: LandingHeadCopy): string {
  if (!template.includes(LANDING_HEAD_PLACEHOLDER)) {
    throw new Error(`index.html is missing ${LANDING_HEAD_PLACEHOLDER}`);
  }
  if (!HTML_TAG.test(template)) {
    throw new Error('index.html is missing <html lang>');
  }

  return template
    .replace(HTML_TAG, `<html lang="${HTML_LANG[language]}">`)
    .replace(MANIFEST_LINK, `<link rel="manifest" href="${MANIFEST_HREF[language]}" />`)
    .replace(LANDING_HEAD_PLACEHOLDER, () => renderLandingHead(language, copy));
}
