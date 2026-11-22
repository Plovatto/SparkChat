import { useTranslation } from 'react-i18next';
import { buildTheme } from '@features/theme/build-theme';
import { CallsShowcase } from './components/CallsShowcase';
import { Faq } from './components/Faq';
import { Features } from './components/Features';
import { Hero } from './components/Hero';
import { Security } from './components/Security';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { ThemeStudio } from './components/ThemeStudio';
import { findLandingWallpaper } from './constants/wallpapers';
import { useLandingTheme } from './hooks/useLandingTheme';
import { useScrollReveal } from './hooks/useScrollReveal';

export function Landing() {
  const { t } = useTranslation('landing');
  const { theme, select } = useLandingTheme();
  useScrollReveal();
  const tokens = buildTheme(theme.base, theme.color).tokens;
  const isDark = tokens.kind === 'dark';
  const wallpaper = findLandingWallpaper(theme.wallpaper)?.background ?? null;

  return (
    <>
      <a className="lp-skip-link" href="#conteudo">
        {t('skipLink')}
      </a>
      <SiteHeader isDark={isDark} onToggleMode={() => select({ base: isDark ? 'light' : 'dark' })} />
      <div className="lp-morph" aria-hidden="true">
        <span className="lp-morph__shape lp-morph__shape--a" />
        <span className="lp-morph__shape lp-morph__shape--b" />
        <span className="lp-morph__shape lp-morph__shape--c" />
      </div>
      <main id="conteudo" className="lp-main">
        <Hero wallpaper={wallpaper} inkColor={tokens.onGradient} accentColor={tokens.accentText} />
        <Features />
        <CallsShowcase />
        <ThemeStudio theme={theme} onSelect={select} />
        <Security />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
