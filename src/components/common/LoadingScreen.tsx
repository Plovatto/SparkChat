import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '@/assets/Logo.svg';
import { buildTheme, withAlpha, type ThemeTokens } from '@features/theme';
import './loading-screen.css';

const DEFAULT_LOADING_THEME = buildTheme('dark', 'standard').tokens;
const BRAND_NAME = 'SparkChat';
const GLOWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const ORBITS = [1, 2, 3] as const;

const SPARKLES = [
  { top: '9%', left: '5%', size: 12, delay: 0 },
  { top: '26%', left: '26%', size: 16, delay: 1.1 },
  { top: '33%', left: '73%', size: 12, delay: 2.3 },
  { top: '63%', left: '78%', size: 18, delay: 0.6 },
  { top: '68%', left: '22%', size: 10, delay: 1.7 },
  { top: '14%', left: '88%', size: 11, delay: 2.9 },
  { top: '86%', left: '56%', size: 9, delay: 0.3 },
];

interface LoadingScreenProps {
  theme?: ThemeTokens;
  leaving?: boolean;
}

function themeVars(theme: ThemeTokens): CSSProperties {
  const ink = theme.onGradient;
  const isDark = theme.kind === 'dark';
  return {
    '--spl-bg': theme.gradient,
    '--spl-logo': `url("${Logo}")`,
    '--spl-ink': ink,
    '--spl-ink-soft': withAlpha(ink, 0.72),
    '--spl-ink-faint': withAlpha(ink, 0.14),
    '--spl-ring': withAlpha(ink, isDark ? 0.12 : 0.18),
    '--spl-glass-strong': withAlpha(ink, isDark ? 0.14 : 0.2),
    '--spl-glass-border': withAlpha(ink, isDark ? 0.2 : 0.28),
    '--spl-shade': isDark ? 'rgba(8, 6, 24, 0.52)' : 'rgba(10, 8, 30, 0.34)',
    '--spl-shade-edge': isDark ? 'rgba(4, 3, 14, 0.45)' : 'rgba(6, 5, 20, 0.3)',
    '--spl-glow-a': withAlpha(theme.accent, 0.85),
    '--spl-glow-b': withAlpha(theme.accentSecondary, 0.8),
    '--spl-glow-c': withAlpha(ink, 0.2),
    '--spl-blend': 'screen',
  } as CSSProperties;
}

function Sparkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c.6 6.6 2.9 9.6 12 12-9.1 2.4-11.4 5.4-12 12-.6-6.6-2.9-9.6-12-12C9.1 9.6 11.4 6.6 12 0Z" />
    </svg>
  );
}

export function LoadingScreen({ theme = DEFAULT_LOADING_THEME, leaving = false }: LoadingScreenProps) {
  const { t } = useTranslation();

  return (
    <div
      className="sc-splash"
      data-state={leaving ? 'leaving' : 'visible'}
      style={themeVars(theme)}
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
    >
      <div className="sc-splash__glows" aria-hidden="true">
        {GLOWS.map((id) => (
          <span key={id} className={`sc-splash__glow sc-splash__glow--${id}`}>
            <span className="sc-splash__blob" />
          </span>
        ))}
      </div>

      <div className="sc-splash__sparkles" aria-hidden="true">
        {SPARKLES.map((sparkle, index) => (
          <span
            key={index}
            className="sc-splash__sparkle"
            style={{ top: sparkle.top, left: sparkle.left, '--spl-delay': `${sparkle.delay}s` } as CSSProperties}
          >
            <Sparkle size={sparkle.size} />
          </span>
        ))}
      </div>

      <div className="sc-splash__core">
        <div className="sc-splash__emblem" aria-hidden="true">
          <div className="sc-splash__rings">
            <span className="sc-splash__ring sc-splash__ring--1" />
            <span className="sc-splash__ring sc-splash__ring--2" />
            <span className="sc-splash__ring sc-splash__ring--3" />
            <span className="sc-splash__ripple" />
            <span className="sc-splash__ripple sc-splash__ripple--late" />
            {ORBITS.map((id) => (
              <span key={id} className={`sc-splash__orbit sc-splash__orbit--${id}`}>
                <span className="sc-splash__orbiter" />
              </span>
            ))}
          </div>
          <span className="sc-splash__halo" />
          <svg className="sc-splash__progress" viewBox="0 0 140 140">
            <defs>
              <linearGradient id="sc-splash-arc" gradientUnits="userSpaceOnUse" x1="134" y1="62" x2="44" y2="134">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
              </linearGradient>
            </defs>
            <circle className="sc-splash__track" cx="70" cy="70" r="64" />
            <g className="sc-splash__spinner">
              <circle className="sc-splash__arc" cx="70" cy="70" r="64" stroke="url(#sc-splash-arc)" />
              <circle className="sc-splash__comet" cx="51.3" cy="131.2" r="3.5" />
            </g>
          </svg>
          <span className="sc-splash__disc">
            <span className="sc-splash__bolt">
              <span className="sc-splash__logo" />
            </span>
          </span>
        </div>

        <h1 className="sc-splash__title" aria-label={BRAND_NAME}>
          {BRAND_NAME.split('').map((letter, index) => (
            <span key={index} aria-hidden="true" style={{ '--spl-i': index } as CSSProperties}>
              {letter}
            </span>
          ))}
        </h1>

        <p className="sc-splash__status">
          {t('splash.loading')}
          <span className="sc-splash__dots" aria-hidden="true">
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </p>
      </div>
    </div>
  );
}
