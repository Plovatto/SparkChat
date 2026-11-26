import type { CSSProperties } from 'react';
import { LuCheckCheck } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { resolveBubbleStyle, useTheme, type ResolvedBubbleStyle, type ThemePalette } from '@features/theme';
import type { ChatBackground } from '@features/theme/constants/chat-backgrounds';
import type { ChatAppearance } from '@features/theme/constants/chat-appearance';

interface AppearanceBubblePreviewProps {
  appearance: ChatAppearance;
  wallpaper: ChatBackground | null;
  theme?: ThemePalette | undefined;
}

function bubbleStyle(bubble: ResolvedBubbleStyle): CSSProperties {
  return {
    backgroundColor: bubble.background,
    color: bubble.textColor,
    backdropFilter: bubble.blur > 0 ? `blur(${bubble.blur}px)` : undefined,
    WebkitBackdropFilter: bubble.blur > 0 ? `blur(${bubble.blur}px)` : undefined,
  };
}

export function AppearanceBubblePreview({ appearance, wallpaper, theme: themeOverride }: AppearanceBubblePreviewProps) {
  const { t } = useTranslation();
  const { theme: contextTheme } = useTheme();
  const theme = themeOverride ?? contextTheme;
  const incoming = resolveBubbleStyle(theme, appearance, false);
  const outgoing = resolveBubbleStyle(theme, appearance, true);
  const surfaceStyle: CSSProperties | undefined = wallpaper?.background
    ? { background: wallpaper.isImage ? `${wallpaper.background} center/cover` : wallpaper.background }
    : undefined;
  const showOverlay = Boolean(wallpaper?.isImage) && appearance.overlayOpacity > 0;

  return (
    <div className="sc-appearance-preview" style={surfaceStyle} role="img" aria-label={t('chat.appearanceModal.preview')}>
      {showOverlay && (
        <div
          className="sc-appearance-preview-overlay"
          style={{
            backgroundColor: `rgba(0, 0, 0, ${appearance.overlayOpacity / 100})`,
            backdropFilter: appearance.overlayBlur > 0 ? `blur(${appearance.overlayBlur}px)` : undefined,
            WebkitBackdropFilter: appearance.overlayBlur > 0 ? `blur(${appearance.overlayBlur}px)` : undefined,
          }}
        />
      )}
      <div className="sc-appearance-bubble sc-appearance-bubble--in" style={bubbleStyle(incoming)}>
        <span>{t('chat.appearanceModal.previewIncoming')}</span>
        <span className="sc-appearance-bubble-meta" style={{ color: incoming.mutedTextColor }}>
          11:42
        </span>
      </div>
      <div className="sc-appearance-bubble sc-appearance-bubble--out" style={bubbleStyle(outgoing)}>
        <span>{t('chat.appearanceModal.previewOutgoing')}</span>
        <span className="sc-appearance-bubble-meta" style={{ color: outgoing.mutedTextColor }}>
          11:44
          <LuCheckCheck size={13} color={theme.receiptRead} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
