import { buildTheme } from '@features/theme/build-theme';
import { Faq } from './components/Faq';
import { Features } from './components/Features';
import { Hero } from './components/Hero';
import { Screenshots } from './components/Screenshots';
import { Security } from './components/Security';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { ThemeStudio } from './components/ThemeStudio';
import { findLandingWallpaper } from './constants/wallpapers';
import { useLandingTheme } from './hooks/useLandingTheme';
import { useScrollReveal } from './hooks/useScrollReveal';

export function Landing() {
  const { theme, select } = useLandingTheme();
  useScrollReveal();
  const isDark = buildTheme(theme.base, theme.color).tokens.kind === 'dark';
  const wallpaper = findLandingWallpaper(theme.wallpaper)?.background ?? null;

  return (
    <>
      <a className="lp-skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <SiteHeader isDark={isDark} onToggleMode={() => select({ base: isDark ? 'light' : 'dark' })} />
      <main id="conteudo">
        <Hero wallpaper={wallpaper} />
        <Features />
        <ThemeStudio theme={theme} onSelect={select} />
        <Screenshots />
        <Security />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
