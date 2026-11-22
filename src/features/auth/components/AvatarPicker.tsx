import type { CSSProperties } from 'react';
import { PhotoPickerTile } from '@features/profile-photos/components/PhotoPickerTile';
import type { ThemeKind } from '@features/theme/types';
import { translate } from '@lib/i18n/app-i18n';
import { SELECTABLE_AVATARS } from '../constants/avatars';
import '../styles/avatar-picker.css';

const DEFAULT_TILE_SIZE = 52;
const DEFAULT_ICON_SIZE = 22;
const MAX_STAGGER_INDEX = 12;

interface AvatarPickerProps {
  selectedAvatar: number;
  onSelectAvatar: (index: number) => void;
  photoUrl: string | null;
  isPhotoSelected: boolean;
  isPhotoBusy?: boolean;
  onChoosePhoto: () => void;
  onSelectPhoto: () => void;
  onRemovePhoto: () => void;
  onViewPhoto?: (photoUrl: string) => void;
  labelledBy?: string;
  kind?: ThemeKind;
  tileSize?: number;
  iconSize?: number;
  entranceDelayMs?: number;
  panelMaxHeight?: number;
}

export function AvatarPicker({
  selectedAvatar,
  onSelectAvatar,
  photoUrl,
  isPhotoSelected,
  isPhotoBusy = false,
  onChoosePhoto,
  onSelectPhoto,
  onRemovePhoto,
  onViewPhoto,
  labelledBy,
  kind = 'dark',
  tileSize = DEFAULT_TILE_SIZE,
  iconSize = DEFAULT_ICON_SIZE,
  entranceDelayMs = 0,
  panelMaxHeight,
}: AvatarPickerProps) {
  return (
    <div
      className="sc-avatar-picker"
      data-kind={kind}
      role="group"
      aria-labelledby={labelledBy}
      style={{ '--sc-avatar-picker-delay': `${entranceDelayMs}ms`, maxHeight: panelMaxHeight ? `${panelMaxHeight}px` : undefined } as CSSProperties}
    >
      <PhotoPickerTile
        size={tileSize}
        iconSize={iconSize}
        photoUrl={photoUrl}
        isSelected={isPhotoSelected}
        isBusy={isPhotoBusy}
        onChoose={onChoosePhoto}
        onSelect={onSelectPhoto}
        onRemove={onRemovePhoto}
        onView={onViewPhoto}
        className="sc-avatar-picker__tile sc-avatar-picker__photo"
        style={{ width: '100%', maxWidth: `${tileSize}px`, '--sc-avatar-picker-i': 0 } as CSSProperties}
      />
      {SELECTABLE_AVATARS.map(({ avatar, index }, position) => {
        const IconComponent = avatar.icon;
        const isSelected = !isPhotoSelected && selectedAvatar === index;

        return (
          <button
            type="button"
            key={avatar.name}
            onClick={() => onSelectAvatar(index)}
            data-selected={isSelected}
            aria-pressed={isSelected}
            title={translate(`avatars.${avatar.name}`)}
            aria-label={translate(`avatars.${avatar.name}`)}
            className="sc-avatar-picker__tile sc-avatar-picker__option"
            style={{ maxWidth: `${tileSize}px`, '--sc-avatar-picker-i': Math.min(position + 1, MAX_STAGGER_INDEX) } as CSSProperties}
          >
            <IconComponent size={iconSize} />
          </button>
        );
      })}
    </div>
  );
}
