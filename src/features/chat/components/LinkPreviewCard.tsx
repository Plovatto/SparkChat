import { useEffect, useState } from 'react';
import { FaExternalLinkAlt, FaLink, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useTheme, type ResolvedBubbleStyle } from '@features/theme';
import type { MessageLinkPreview } from '@lib/socket';
import { getLinkPreviewHost, hasDisplayableLinkPreviewImage, resolveLinkPreviewTarget } from '../utils/link-preview-target';

interface LinkPreviewCardProps {
  preview: MessageLinkPreview;
  variant: 'composer' | 'bubble';
  bubble?: ResolvedBubbleStyle;
  messageText?: string;
  imageBlob?: Blob | null;
  onDismiss?: () => void;
}

function useBlobObjectUrl(blob: Blob | null | undefined): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }

    const createdUrl = URL.createObjectURL(blob);
    setObjectUrl(createdUrl);
    return () => {
      URL.revokeObjectURL(createdUrl);
    };
  }, [blob]);

  return objectUrl;
}

export function LinkPreviewCard({ preview, variant, bubble, messageText, imageBlob, onDismiss }: LinkPreviewCardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const composerImageUrl = useBlobObjectUrl(imageBlob);
  const isComposer = variant === 'composer';

  const cardBackground = isComposer || !bubble ? theme.surfaceSunken : bubble.innerBackground;
  const titleColor = isComposer || !bubble ? theme.textPrimary : bubble.textColor;
  const siteNameColor = isComposer || !bubble ? theme.textSecondary : bubble.mutedTextColor;
  const iconBackground = isComposer || !bubble ? theme.accentSoft : bubble.innerStrongBackground;
  const iconColor = isComposer || !bubble ? theme.accentText : bubble.accentColor;
  const imageObjectUrl = isComposer ? composerImageUrl : hasDisplayableLinkPreviewImage(preview.imageUrl) ? preview.imageUrl : null;
  const linkTarget = isComposer ? null : resolveLinkPreviewTarget(preview.url, messageText ?? '');
  const displayHost = getLinkPreviewHost(preview.url);
  const openPreview = linkTarget ? () => window.open(linkTarget, '_blank', 'noopener,noreferrer') : undefined;

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
      {displayHost && (
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
          <span data-testid="link-preview-host" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayHost}
          </span>
        </div>
      )}
    </div>
  );

  const dismissButton = isComposer && onDismiss && (
    <button type="button" onClick={onDismiss} title={t('chat.input.removePreview')} className="sc-icon-btn sc-icon-btn--ghost" style={{ width: '28px', height: '28px' }}>
      <FaTimes size={14} />
    </button>
  );

  if (imageObjectUrl && !isComposer) {
    return (
      <div
        onClick={openPreview}
        className={openPreview ? 'sc-bubble-card' : undefined}
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
      className={openPreview ? 'sc-bubble-card' : undefined}
      style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        background: cardBackground,
        border: isComposer ? `1px solid ${theme.border}` : 'none',
        borderRadius: '10px',
        padding: '8px 10px',
        cursor: openPreview ? 'pointer' : 'default',
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
