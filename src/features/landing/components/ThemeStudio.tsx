import { useMemo } from 'react';
import { buildTheme } from '@features/theme/build-theme';
import { CHAT_BACKGROUNDS } from '@features/theme/constants/chat-backgrounds';
import { COLOR_THEMES, type ColorThemeId } from '@features/theme/constants/color-themes';
import { APP_URL } from '../constants/content';
import { LANDING_MODES, findLandingMode } from '../constants/modes';
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
  const swatches = useMemo(
    () =>
      COLOR_IDS.map((id) => ({
        id,
        name: COLOR_THEMES[id].name,
        gradient: buildTheme(theme.base, id).tokens.gradient,
      })),
    [theme.base],
  );

  const mode = findLandingMode(theme.base);
  const colorName = COLOR_THEMES[theme.color].name;
  const wallpaper = findLandingWallpaper(theme.wallpaper);

  return (
    <section id="temas" className="lp-section lp-section--sunken" aria-labelledby="temas-title">
      <div className="lp-container lp-studio">
        <div className="lp-studio__controls">
          <div className="lp-section__intro lp-section__intro--start">
            <h2 id="temas-title" className="lp-section__title">
              Escolha as cores do seu chat
            </h2>
            <p className="lp-section__lead">
              São 3 modos e {COLOR_IDS.length} cores, com o contraste ajustado em cada combinação. Experimente aqui: a página inteira muda
              junto.
            </p>
          </div>

          <div className="lp-studio__group" role="group" aria-labelledby="studio-mode-label">
            <span id="studio-mode-label" className="lp-studio__label">
              Modo
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
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lp-studio__group" role="group" aria-labelledby="studio-color-label">
            <span id="studio-color-label" className="lp-studio__label">
              Cor <span className="lp-studio__current">{colorName}</span>
            </span>
            <div className="lp-swatches">
              {swatches.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  className="sc-tile lp-swatch"
                  style={{ background: swatch.gradient }}
                  data-selected={theme.color === swatch.id ? 'true' : undefined}
                  aria-pressed={theme.color === swatch.id}
                  aria-label={swatch.name}
                  title={swatch.name}
                  onClick={() => onSelect({ color: swatch.id })}
                />
              ))}
            </div>
          </div>

          <div className="lp-studio__group" role="group" aria-labelledby="studio-wallpaper-label">
            <span id="studio-wallpaper-label" className="lp-studio__label">
              Papel de parede <span className="lp-studio__current">{wallpaper?.name}</span>
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
                  aria-label={item.name}
                  title={item.name}
                  onClick={() => onSelect({ wallpaper: item.id })}
                />
              ))}
            </div>
            <p className="lp-studio__hint">
              Aqui estão {LANDING_WALLPAPERS.length} dos {WALLPAPER_TOTAL} papéis de parede.{' '}
              <a className="sc-link" href={APP_URL}>
                Entre no chat para ver todos
              </a>
              .
            </p>
          </div>
        </div>

        <div className="lp-studio__preview">
          <PhonePreview wallpaper={wallpaper?.background ?? null} colorName={colorName} modePhrase={mode.phrase} />
        </div>
      </div>
    </section>
  );
}
