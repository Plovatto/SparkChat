import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaAdjust, FaImage, FaPalette, FaSlidersH } from 'react-icons/fa';
import { AppearanceBubblePreview } from '@features/chat/components/appearance/AppearanceBubblePreview';
import { useTheme, useThemeNames } from '@features/theme';
import type { AssistantLook } from '@lib/assistant/assistant-card';
import { resolveLook } from '../look-resolve';

interface AssistantLookPreviewProps {
  look: AssistantLook;
  label?: ReactNode;
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

export function AssistantLookPreview({ look, label }: AssistantLookPreviewProps) {
  const { t } = useTranslation();
  const { baseTheme, colorTheme, chatSettings } = useTheme();
  const names = useThemeNames();
  const resolved = resolveLook(look, { baseTheme, colorTheme, chatSettings });

  const labelKeys = new Set(Object.keys(look.appearance ?? {}).flatMap(labelKeyFor));
  const appearanceItems = [...labelKeys].map((key) => t(key));

  return (
    <>
      <div className="sc-assistant-look-preview">
        <AppearanceBubblePreview appearance={resolved.appearance} wallpaper={resolved.wallpaper} theme={resolved.theme} />
      </div>
      <div className="sc-assistant-look-body">
        {label}
        <ul className="sc-assistant-look-tags">
          {resolved.changesColor && <LookTag icon={<FaPalette size={11} aria-hidden="true" />} text={names.color(resolved.colorTheme)} />}
          {resolved.changesBase && <LookTag icon={<FaAdjust size={11} aria-hidden="true" />} text={names.base(resolved.baseTheme)} />}
          {resolved.changesWallpaper && resolved.wallpaperId && (
            <LookTag icon={<FaImage size={11} aria-hidden="true" />} text={names.wallpaper(resolved.wallpaperId)} />
          )}
          {appearanceItems.length > 0 && (
            <LookTag
              icon={<FaSlidersH size={11} aria-hidden="true" />}
              text={t('chat.assistant.card.lookAppearance', { items: appearanceItems.join(', ') })}
            />
          )}
        </ul>
      </div>
    </>
  );
}

function LookTag({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <li className="sc-assistant-look-tag">
      {icon}
      {text}
    </li>
  );
}
