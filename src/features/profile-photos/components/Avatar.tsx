import { useState, type CSSProperties, type ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { useTranslation } from 'react-i18next';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { useTheme } from '@features/theme';
import { useRoomPhoto, useUserPhoto } from '../index';
import './profile-photos.css';

export type AvatarTone = 'gradient' | 'soft' | 'solid';

export interface AvatarProps {
  userId?: string | null;
  roomId?: string | null;
  avatarIndex?: number;
  size: number;
  iconSize: number;
  tone?: AvatarTone;
  icon?: IconType;
  iconColor?: string;
  background?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  viewLabel?: string;
  onClick?: () => void;
  onPhotoClick?: (photoUrl: string) => void;
  children?: ReactNode;
}

interface AvatarPhotoProps {
  src: string;
}

function AvatarPhoto({ src }: AvatarPhotoProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="sc-avatar-photo"
      data-loaded={loadedSrc === src}
      ref={(element) => {
        if (element?.complete && element.naturalWidth > 0 && loadedSrc !== src) {
          setLoadedSrc(src);
        }
      }}
      onLoad={() => setLoadedSrc(src)}
    />
  );
}

export function Avatar({
  userId,
  roomId,
  avatarIndex,
  size,
  iconSize,
  tone = 'gradient',
  icon,
  iconColor,
  background,
  className,
  style,
  title,
  viewLabel,
  onClick,
  onPhotoClick,
  children,
}: AvatarProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const userPhoto = useUserPhoto(roomId ? null : userId);
  const roomPhoto = useRoomPhoto(roomId ?? null);
  const photo = roomId ? roomPhoto : userPhoto;
  const preset = avatarIndex === undefined ? undefined : AVATARS[avatarIndex];
  const Icon = icon ?? preset?.icon;

  const toneBackground: Record<AvatarTone, string> = {
    gradient: preset?.bgGradient ?? theme.gradientControl,
    soft: theme.accentSoft,
    solid: preset?.color ?? theme.accent,
  };
  const resolvedIconColor = iconColor ?? (tone === 'soft' ? theme.accentText : AVATAR_ICON_COLOR);

  const baseStyle: CSSProperties = {
    position: 'relative',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: background ?? toneBackground[tone],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...style,
  };

  const content = (
    <>
      {Icon && <Icon size={iconSize} color={resolvedIconColor} aria-hidden="true" />}
      {photo && <AvatarPhoto key={photo} src={photo} />}
      {children}
    </>
  );

  if (photo && onPhotoClick) {
    const label = viewLabel ?? t('profilePhotos.view');
    return (
      <button
        type="button"
        className={`sc-avatar-view-btn${className ? ` ${className}` : ''}`}
        style={baseStyle}
        title={title ?? label}
        aria-label={label}
        data-has-photo="true"
        onClick={(event) => {
          event.stopPropagation();
          onPhotoClick(photo);
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={baseStyle} title={title} onClick={onClick} data-has-photo={photo ? 'true' : undefined}>
      {content}
    </div>
  );
}
