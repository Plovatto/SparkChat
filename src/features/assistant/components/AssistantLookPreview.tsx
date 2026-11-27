import { useTranslation } from 'react-i18next';
import { AppearanceBubblePreview } from '@features/chat/components/appearance/AppearanceBubblePreview';
import { useTheme, useThemeNames } from '@features/theme';
import type { AssistantLook } from '@lib/assistant/assistant-card';
import { resolveLook } from '../look-resolve';

interface AssistantLookPreviewProps {
  look: AssistantLook;
  kicker?: string;
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

export function AssistantLookPreview({ look, kicker }: AssistantLookPreviewProps) {
  const { t } = useTranslation();
  const { baseTheme, colorTheme, chatSettings } = useTheme();
  const names = useThemeNames();
  const resolved = resolveLook(look, { baseTheme, colorTheme, chatSettings });

  const labelKeys = new Set(Object.keys(look.appearance ?? {}).flatMap(labelKeyFor));
  const appearanceItems = [...labelKeys].map((key) => t(key));

  const parts: { name: string; subtitle: string }[] = [];
  if (resolved.changesColor) {
    const name = names.color(resolved.colorTheme);
    parts.push({ name, subtitle: name });
  }
  if (resolved.changesWallpaper && resolved.wallpaperId) {
    const name = names.wallpaper(resolved.wallpaperId);
    parts.push({ name, subtitle: name });
  }
  if (resolved.changesBase) {
    const name = names.base(resolved.baseTheme);
    parts.push({ name, subtitle: name });
  }
  if (appearanceItems.length > 0) {
    parts.push({
      name: t('chat.assistant.card.lookAdjusted'),
      subtitle: t('chat.assistant.card.lookAppearance', { items: appearanceItems.join(', ') }),
    });
  }
  const [main, ...rest] = parts;

  return (
    <>
      <div className="sc-assistant-look-preview">
        <AppearanceBubblePreview appearance={resolved.appearance} wallpaper={resolved.wallpaper} theme={resolved.theme} />
      </div>
      <div className="sc-assistant-look-body">
        {kicker && <p className="sc-assistant-look-kicker">{kicker}</p>}
        {main && <p className="sc-assistant-look-title">{main.name}</p>}
        {rest.length > 0 && <p className="sc-assistant-look-detail">{rest.map((part) => part.subtitle).join(' · ')}</p>}
      </div>
    </>
  );
}
