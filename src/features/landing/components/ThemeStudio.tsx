import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildTheme } from '@features/theme/build-theme';
import { CHAT_BACKGROUNDS } from '@features/theme/constants/chat-backgrounds';
import { COLOR_THEMES, type ColorThemeId } from '@features/theme/constants/color-themes';
import { useThemeNames } from '@features/theme/hooks/useThemeNames';
import { FaChevronDown } from 'react-icons/fa';
import { APP_URL } from '../constants/content';
import { LANDING_MODES } from '../constants/modes';
import { LANDING_WALLPAPERS, findLandingWallpaper } from '../constants/wallpapers';
import type { LandingThemeChoice } from '../lib/landing-theme-storage';
import { PhonePreview } from './PhonePreview';

interface ThemeStudioProps {
  theme: LandingThemeChoice;
  onSelect: (change: Partial<LandingThemeChoice>) => void;
}

const COLOR_IDS = Object.keys(COLOR_THEMES) as ColorThemeId[];
const WALLPAPER_TOTAL = CHAT_BACKGROUNDS.filter((background) => background.background !== null).length;

export function ThemeStudio({ theme, onSelect }: ThemeStudioProps) {
  const { t } = useTranslation('landing');
  const names = useThemeNames();
  const [showAll, setShowAll] = useState(false);
  const swatchesId = useId();
  const gradients = useMemo(
    () => COLOR_IDS.map((id) => ({ id, gradient: buildTheme(theme.base, id).tokens.gradient })),
    [theme.base],
  );

  const colorName = names.color(theme.color);
  const wallpaper = findLandingWallpaper(theme.wallpaper);
  const wallpaperName = wallpaper ? names.wallpaper(wallpaper.id) : null;

  return (
    <section id="temas" className="lp-section" aria-labelledby="temas-title">
      <div className="lp-container lp-studio">
        <div className="lp-studio__controls">
          <div className="lp-section__intro lp-section__intro--start">
            <h2 id="temas-title" className="lp-section__title">
              {t('studio.title')}
            </h2>
            <p className="lp-section__lead">{t('studio.lead', { colors: COLOR_IDS.length })}</p>
          </div>

          <div className="lp-studio__group" role="group" aria-labelledby="studio-mode-label">
            <span id="studio-mode-label" className="lp-studio__label">
              {t('studio.mode')}
            </span>
            <div className="lp-segments">
              {LANDING_MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="sc-segment"
                    aria-pressed={theme.base === item.id}
                    onClick={() => onSelect({ base: item.id })}
                  >
                    <Icon size={13} aria-hidden="true" />
                    {t(`studio.modes.${item.id}.label`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lp-studio__group" role="group" aria-labelledby="studio-color-label">
            <span id="studio-color-label" className="lp-studio__label">
              {t('studio.color')} <span className="lp-studio__current">{colorName}</span>
            </span>
            <div id={swatchesId} className="lp-swatches" data-expanded={showAll ? 'true' : undefined}>
              {gradients.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  className="sc-tile lp-swatch"
                  style={{ background: swatch.gradient }}
                  data-selected={theme.color === swatch.id ? 'true' : undefined}
                  aria-pressed={theme.color === swatch.id}
                  aria-label={names.color(swatch.id)}
                  title={names.color(swatch.id)}
                  onClick={() => onSelect({ color: swatch.id })}
                />
              ))}
            </div>
            <button type="button" className="sc-btn sc-btn--ghost lp-swatches__toggle" aria-expanded={showAll} aria-controls={swatchesId} onClick={() => setShowAll((value) => !value)}>
              {showAll ? t('studio.showLess') : t('studio.showAll', { count: COLOR_IDS.length })}
              <FaChevronDown size={11} aria-hidden="true" className="lp-swatches__chevron" />
            </button>
          </div>

          <div className="lp-studio__group" role="group" aria-labelledby="studio-wallpaper-label">
            <span id="studio-wallpaper-label" className="lp-studio__label">
              {t('studio.wallpaper')} <span className="lp-studio__current">{wallpaperName}</span>
            </span>
            <div className="lp-wallpapers">
              {LANDING_WALLPAPERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sc-tile lp-wallpaper"
                  style={item.thumbnail ? { background: item.thumbnail, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  data-selected={theme.wallpaper === item.id ? 'true' : undefined}
                  aria-pressed={theme.wallpaper === item.id}
                  aria-label={names.wallpaper(item.id)}
                  title={names.wallpaper(item.id)}
                  onClick={() => onSelect({ wallpaper: item.id })}
                />
              ))}
            </div>
            <p className="lp-studio__hint">
              {t('studio.hint', { shown: LANDING_WALLPAPERS.length, total: WALLPAPER_TOTAL })}{' '}
              <a className="sc-link" href={APP_URL}>
                {t('studio.seeAll')}
              </a>
              .
            </p>
          </div>
        </div>

        <div className="lp-studio__preview">
          <PhonePreview wallpaper={wallpaper?.background ?? null} colorName={colorName} modePhrase={t(`studio.modes.${theme.base}.phrase`)} />
        </div>
      </div>
    </section>
  );
}
