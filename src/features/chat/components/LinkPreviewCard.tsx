import { useEffect, useState } from 'react';
import { FaExternalLinkAlt, FaLink, FaTimes } from 'react-icons/fa';
import { fetchLinkPreviewImageObjectUrl, type LinkPreviewAuth } from '@lib/api/link-preview';
import type { MessageLinkPreview } from '@lib/socket';
import type { ThemePalette } from '@features/theme';

interface LinkPreviewCardProps {
  preview: MessageLinkPreview;
  theme: ThemePalette;
  auth: LinkPreviewAuth;
  variant: 'composer' | 'bubble';
  isOwn?: boolean;
  baseTheme?: string;
  onDismiss?: () => void;
}

function useLinkPreviewImage(imageUrl: string | null, userId: string, sessionToken: string): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    void fetchLinkPreviewImageObjectUrl(imageUrl, { userId, sessionToken }).then((url) => {
      if (cancelled) {
        if (url) {
          URL.revokeObjectURL(url);
        }
        return;
      }
      createdUrl = url;
      setObjectUrl(url);
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

export function LinkPreviewCard({ preview, theme, auth, variant, isOwn, baseTheme, onDismiss }: LinkPreviewCardProps) {
  const imageObjectUrl = useLinkPreviewImage(preview.imageUrl, auth.userId, auth.sessionToken);
  const isComposer = variant === 'composer';

  const cardBackground = isComposer
    ? theme.background
    : isOwn
      ? 'rgba(255, 255, 255, 0.14)'
      : baseTheme === 'light'
        ? '#77777720'
        : 'rgba(255, 255, 255, 0.07)';
  const titleColor = isComposer ? theme.text : isOwn ? 'white' : theme.text;
  const siteNameColor = isComposer ? theme.textSecondary : isOwn ? 'rgba(255, 255, 255, 0.75)' : theme.textSecondary;
  const iconBackground = isComposer
    ? theme.surface
    : isOwn
      ? 'rgba(255, 255, 255, 0.18)'
      : baseTheme === 'light'
        ? '#77777730'
        : 'rgba(255, 255, 255, 0.15)';
  const iconColor = isComposer ? theme.primary : isOwn ? 'white' : theme.primary;

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
    <button
      onClick={onDismiss}
      title="Remover preview"
      style={{
        background: 'transparent',
        border: 'none',
        color: theme.textSecondary,
        cursor: 'pointer',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '4px',
      }}
    >
      <FaTimes size={14} />
    </button>
  );

  if (imageObjectUrl && !isComposer) {
    return (
      <div
        onClick={isComposer ? undefined : () => window.open(preview.url, '_blank', 'noopener,noreferrer')}
        style={{
          background: cardBackground,
          border: isComposer ? `1px solid ${theme.border}` : 'none',
          borderRadius: '10px',
          overflow: 'hidden',
          cursor: isComposer ? 'default' : 'pointer',
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
      onClick={isComposer ? undefined : () => window.open(preview.url, '_blank', 'noopener,noreferrer')}
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
          background: imageObjectUrl ? theme.surface : iconBackground,
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
