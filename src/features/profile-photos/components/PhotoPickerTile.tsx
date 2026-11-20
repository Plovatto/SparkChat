import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCamera, FaPlus, FaTimes } from 'react-icons/fa';
import { Spinner } from '@components/common/Spinner';
import './profile-photos.css';

interface PhotoPickerTileProps {
  size: number;
  iconSize: number;
  photoUrl: string | null;
  isSelected: boolean;
  isBusy?: boolean;
  onChoose: () => void;
  onSelect: () => void;
  onRemove: () => void;
  onView?: (photoUrl: string) => void;
  style?: CSSProperties;
  className?: string;
}

export function PhotoPickerTile({ size, iconSize, photoUrl, isSelected, isBusy = false, onChoose, onSelect, onRemove, onView, style, className }: PhotoPickerTileProps) {
  const { t } = useTranslation();
  const hasPhoto = photoUrl !== null;
  const isViewable = hasPhoto && isSelected && Boolean(onView);

  const label = !hasPhoto ? t('profilePhotos.choose') : isViewable ? t('profilePhotos.viewMine') : isSelected ? t('profilePhotos.change') : t('profilePhotos.useMine');

  const handleClick = () => {
    if (isBusy) {
      return;
    }
    if (!photoUrl) {
      onChoose();
    } else if (!isSelected) {
      onSelect();
    } else if (onView) {
      onView(photoUrl);
    } else {
      onChoose();
    }
  };

  return (
    <div className={`sc-photo-tile${className ? ` ${className}` : ''}`} style={{ width: `${size}px`, ...style }}>
      <button
        type="button"
        className="sc-photo-tile__button"
        onClick={handleClick}
        data-selected={isSelected}
        data-has-photo={hasPhoto}
        data-viewable={isViewable}
        aria-pressed={hasPhoto ? isSelected : undefined}
        aria-busy={isBusy || undefined}
        title={label}
        aria-label={label}
      >
        {photoUrl ? (
          <img key={photoUrl} src={photoUrl} alt="" draggable={false} className="sc-photo-tile__image" />
        ) : (
          <span className="sc-photo-tile__icon" aria-hidden="true">
            <FaCamera />
          </span>
        )}
        {isBusy && (
          <span className="sc-photo-edit-overlay" aria-hidden="true">
            <Spinner size={Math.max(12, Math.round(iconSize * 0.5))} />
          </span>
        )}
      </button>

      {hasPhoto ? (
        <button
          type="button"
          className="sc-photo-badge sc-photo-tile__badge"
          onClick={onChoose}
          disabled={isBusy}
          title={t('profilePhotos.change')}
          aria-label={t('profilePhotos.change')}
        >
          <FaCamera />
        </button>
      ) : (
        <span
          className="sc-photo-badge sc-photo-tile__badge"
          data-static="true"
          aria-hidden="true"
        >
          <FaPlus />
        </span>
      )}

      {hasPhoto && (
        <button
          type="button"
          className="sc-photo-badge sc-photo-badge--remove sc-photo-tile__remove"
          onClick={onRemove}
          disabled={isBusy}
          title={t('profilePhotos.remove')}
          aria-label={t('profilePhotos.remove')}
        >
          <FaTimes />
        </button>
      )}
    </div>
  );
}
