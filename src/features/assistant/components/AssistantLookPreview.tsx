import { useTranslation } from 'react-i18next';
import { AppearanceBubblePreview } from '@features/chat/components/appearance/AppearanceBubblePreview';
import { useTheme, useThemeNames } from '@features/theme';
import type { AssistantLook } from '@lib/assistant/assistant-card';
import { resolveLook } from '../look-resolve';

interface AssistantLookPreviewProps {
  look: AssistantLook;
}

const APPEARANCE_LABEL_KEYS = {
  overlayOpacity: 'chat.appearance.dim',
  overlayBlur: 'chat.appearance.blur',
  ownBubbleColor: 'chat.appearanceModal.sent',
  ownBubbleOpacity: 'chat.appearanceModal.sent',
  ownTextIntensity: 'chat.appearanceModal.sent',
  otherBubbleColor: 'chat.appearanceModal.received',
  otherBubbleOpacity: 'chat.appearanceModal.received',
  otherTextIntensity: 'chat.appearanceModal.received',
  bubbleBlur: 'chat.appearance.bubbleBlur',
} as const;

type AppearanceLabelKey = (typeof APPEARANCE_LABEL_KEYS)[keyof typeof APPEARANCE_LABEL_KEYS];

function labelKeyFor(field: string): AppearanceLabelKey[] {
  return field in APPEARANCE_LABEL_KEYS ? [APPEARANCE_LABEL_KEYS[field as keyof typeof APPEARANCE_LABEL_KEYS]] : [];
}

export function AssistantLookPreview({ look }: AssistantLookPreviewProps) {
  const { t } = useTranslation();
  const { baseTheme, colorTheme, chatSettings } = useTheme();
  const names = useThemeNames();
  const resolved = resolveLook(look, { baseTheme, colorTheme, chatSettings });

  const themeParts: string[] = [];
  if (resolved.changesBase) {
    themeParts.push(names.base(resolved.baseTheme));
  }
  if (resolved.changesColor) {
    themeParts.push(names.color(resolved.colorTheme));
  }
  const labelKeys = new Set(Object.keys(look.appearance ?? {}).flatMap(labelKeyFor));
  const appearanceItems = [...labelKeys].map((key) => t(key));

  return (
    <div className="sc-assistant-look-preview">
      <AppearanceBubblePreview appearance={resolved.appearance} wallpaper={resolved.wallpaper} theme={resolved.theme} />
      <ul className="sc-assistant-look-legend">
        {themeParts.length > 0 && <li>{t('chat.assistant.card.lookTheme', { name: themeParts.join(' · ') })}</li>}
        {resolved.changesWallpaper && resolved.wallpaperId && (
          <li>{t('chat.assistant.card.lookWallpaper', { name: names.wallpaper(resolved.wallpaperId) })}</li>
        )}
        {appearanceItems.length > 0 && <li>{t('chat.assistant.card.lookAppearance', { items: appearanceItems.join(', ') })}</li>}
      </ul>
    </div>
  );
}
