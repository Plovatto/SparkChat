export const MANIFEST_HREF: Record<'pt' | 'en', string> = {
  pt: '/manifest.webmanifest',
  en: '/manifest.en.webmanifest',
};

export function manifestHrefFor(language: string | null | undefined): string {
  return language === 'en' ? MANIFEST_HREF.en : MANIFEST_HREF.pt;
}

export function applyManifestLanguage(doc: Document, language: string | null | undefined): void {
  const href = manifestHrefFor(language);
  let link = doc.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'manifest';
    doc.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
}
