import type { CSSProperties } from 'react';
import { LuBan, LuCheck } from 'react-icons/lu';
import { CHAT_BACKGROUNDS, useThemeNames } from '@features/theme';

interface AppearanceWallpaperGridProps {
  selectedId: string;
  onSelect: (backgroundId: string) => void;
}

export function AppearanceWallpaperGrid({ selectedId, onSelect }: AppearanceWallpaperGridProps) {
  const names = useThemeNames();

  return (
    <div className="sc-appearance-grid" role="radiogroup">
      {CHAT_BACKGROUNDS.map((background) => {
        const isSelected = selectedId === background.id;
        const name = names.wallpaper(background.id);
        const tileStyle: CSSProperties | undefined = background.background
          ? { background: background.isImage ? `${background.background} center/cover no-repeat` : background.background }
          : undefined;

        return (
          <button
            type="button"
            role="radio"
            key={background.id}
            aria-checked={isSelected}
            aria-label={name}
            title={name}
            data-selected={isSelected}
            className={`sc-appearance-tile${background.background ? '' : ' sc-appearance-tile--none'}`}
            style={tileStyle}
            onClick={() => onSelect(background.id)}
          >
            {!background.background && <LuBan size={18} aria-hidden="true" />}
            {isSelected && (
              <span className="sc-appearance-tile-check" aria-hidden="true">
                <LuCheck size={11} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
