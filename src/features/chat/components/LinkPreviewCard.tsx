import { useEffect, useState } from 'react';
import { FaExternalLinkAlt, FaLink, FaTimes } from 'react-icons/fa';
import { useTheme, type ResolvedBubbleStyle } from '@features/theme';
import { fetchLinkPreviewImageBlob } from '@lib/api/link-preview';
import type { SessionAuth } from '@lib/api/session-auth';
import { BoundedMap } from '@lib/cache/bounded-map';
import type { MessageLinkPreview } from '@lib/socket';

interface LinkPreviewCardProps {
  preview: MessageLinkPreview;
  auth: SessionAuth;
  variant: 'composer' | 'bubble';
  bubble?: ResolvedBubbleStyle;
  onDismiss?: () => void;
}

const MAX_CACHED_PREVIEW_IMAGES = 60;
const previewImageCache = new BoundedMap<string, Blob>(MAX_CACHED_PREVIEW_IMAGES);
const pendingPreviewImages = new Map<string, Promise<Blob | null>>();

function loadPreviewImage(imageUrl: string, auth: SessionAuth): Promise<Blob | null> {
  const cached = previewImageCache.get(imageUrl);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingPreviewImages.get(imageUrl);
  if (pending) {
    return pending;
  }

  const task = fetchLinkPreviewImageBlob(imageUrl, auth)
    .then((blob) => {
      if (blob) {
        previewImageCache.set(imageUrl, blob);
      }
      return blob;
    })
    .catch(() => null)
    .finally(() => {
      pendingPreviewImages.delete(imageUrl);
    });

  pendingPreviewImages.set(imageUrl, task);
  return task;
}

function useLinkPreviewImage(imageUrl: string | null, auth: SessionAuth): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const { userId, sessionToken } = auth;

  useEffect(() => {
    if (!imageUrl) {
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    void loadPreviewImage(imageUrl, { userId, sessionToken }).then((blob) => {
      if (cancelled || !blob) {
        return;
      }
      createdUrl = URL.createObjectURL(blob);
      setObjectUrl(createdUrl);
    });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [imageUrl, userId, sessionToken]);

  return objectUrl;
}

export function LinkPreviewCard({ preview, auth, variant, bubble, onDismiss }: LinkPreviewCardProps) {
  const { theme } = useTheme();
  const imageObjectUrl = useLinkPreviewImage(preview.imageUrl, auth);
  const isComposer = variant === 'composer';

  const cardBackground = isComposer || !bubble ? theme.surfaceSunken : bubble.innerBackground;
  const titleColor = isComposer || !bubble ? theme.textPrimary : bubble.textColor;
  const siteNameColor = isComposer || !bubble ? theme.textSecondary : bubble.mutedTextColor;
  const iconBackground = isComposer || !bubble ? theme.accentSoft : bubble.innerStrongBackground;
  const iconColor = isComposer || !bubble ? theme.accentText : bubble.accentColor;
  const openPreview = isComposer ? undefined : () => window.open(preview.url, '_blank', 'noopener,noreferrer');

  const textBlock = (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div
        style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          lineHeight: 1.5,
          color: titleColor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
        }}
      >
        {preview.title}
      </div>
      {preview.siteName && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            lineHeight: 1.5,
            color: siteNameColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <FaExternalLinkAlt size={8} style={{ flexShrink: 0 }} />
          {preview.siteName}
        </div>
      )}
    </div>
  );

  const dismissButton = isComposer && onDismiss && (
    <button type="button" onClick={onDismiss} title="Remover preview" className="sc-icon-btn sc-icon-btn--ghost" style={{ width: '28px', height: '28px' }}>
      <FaTimes size={14} />
    </button>
  );

  if (imageObjectUrl && !isComposer) {
    return (
      <div
        onClick={openPreview}
        className="sc-bubble-card"
        style={{
          background: cardBackground,
          border: 'none',
          borderRadius: '10px',
          overflow: 'hidden',
          maxWidth: '100%',
          position: 'relative',
        }}
      >
        <img
          src={imageObjectUrl}
          alt=""
          style={{ display: 'block', width: '100%', maxHeight: '220px', objectFit: 'cover' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px' }}>
          {textBlock}
          {dismissButton}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={openPreview}
      className={isComposer ? undefined : 'sc-bubble-card'}
      style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        background: cardBackground,
        border: isComposer ? `1px solid ${theme.border}` : 'none',
        borderRadius: '10px',
        padding: '8px 10px',
        cursor: isComposer ? 'default' : 'pointer',
        maxWidth: '100%',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          overflow: 'hidden',
          flexShrink: 0,
          background: imageObjectUrl ? theme.skeleton : iconBackground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageObjectUrl ? (
          <img src={imageObjectUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <FaLink size={15} color={iconColor} />
        )}
      </div>
      {textBlock}
      {dismissButton}
    </div>
  );
}
