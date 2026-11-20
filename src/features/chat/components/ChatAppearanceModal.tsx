import type { CSSProperties, ReactNode } from 'react';
import { LuCheck, LuImage, LuMessagesSquare, LuRotateCcw, LuX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { DEFAULT_CHAT_APPEARANCE, toSixDigitHex, useTheme } from '@features/theme';
import type { ChatAppearance } from '@features/theme/constants/chat-appearance';
import { AppearanceBubbleCard } from './appearance/AppearanceBubbleCard';
import { AppearanceBubblePreview } from './appearance/AppearanceBubblePreview';
import { AppearanceSlider } from './appearance/AppearanceSlider';
import { AppearanceWallpaperGrid } from './appearance/AppearanceWallpaperGrid';
import '../styles/chat-appearance-modal.css';

interface ChatAppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

interface SectionProps {
  index: number;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}

function Section({ index, icon, title, children }: SectionProps) {
  return (
    <section className="sc-appearance-section" style={{ '--sc-appearance-index': index } as CSSProperties}>
      {title && (
        <h3 className="sc-appearance-section-title">
          {icon}
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

export function ChatAppearanceModal({ isOpen, onClose, roomId }: ChatAppearanceModalProps) {
  const { t } = useTranslation();
  const {
    theme,
    getRoomWallpaper,
    setRoomWallpaper,
    resetRoomWallpaper,
    hasRoomWallpaperOverride,
    getRoomAppearance,
    setRoomAppearance,
    resetRoomAppearance,
    hasRoomAppearanceOverride,
  } = useTheme();

  const wallpaper = getRoomWallpaper(roomId);
  const wallpaperId = wallpaper?.id ?? 'default';
  const appearance = getRoomAppearance(roomId);
  const hasPendingChanges = hasRoomAppearanceOverride(roomId) || hasRoomWallpaperOverride(roomId);

  const update = (patch: Partial<ChatAppearance>) => {
    setRoomAppearance(roomId, patch, false);
  };

  const applyToAllChats = () => {
    setRoomAppearance(roomId, appearance, true);
    resetRoomAppearance(roomId, false);
    setRoomWallpaper(roomId, wallpaperId, true);
    resetRoomWallpaper(roomId, false);
  };

  const resetChat = () => {
    resetRoomAppearance(roomId, false);
    resetRoomWallpaper(roomId, false);
  };

  const ownCanReset =
    appearance.ownBubbleColor !== null ||
    appearance.ownBubbleOpacity !== DEFAULT_CHAT_APPEARANCE.ownBubbleOpacity ||
    appearance.ownTextIntensity !== null;
  const otherCanReset =
    appearance.otherBubbleColor !== null ||
    appearance.otherBubbleOpacity !== DEFAULT_CHAT_APPEARANCE.otherBubbleOpacity ||
    appearance.otherTextIntensity !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false} maxWidth="640px">
      <div className="sc-appearance-root" role="dialog" aria-modal="true" aria-labelledby="sc-appearance-title">
        <header className="sc-appearance-header">
          <span className="sc-appearance-header-icon" aria-hidden="true">
            <LuImage size={17} />
          </span>
          <div className="sc-appearance-header-text">
            <h2 id="sc-appearance-title">{t('chat.appearance.title')}</h2>
            <p>{t('chat.appearanceModal.subtitle')}</p>
          </div>
          <button type="button" className="sc-appearance-close" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
            <LuX size={17} />
          </button>
        </header>

        <div className="sc-appearance-body">
          <Section index={0} icon={<LuImage size={15} aria-hidden="true" />} title={t('chat.appearance.wallpaper')}>
            <AppearanceWallpaperGrid selectedId={wallpaperId} onSelect={(backgroundId) => setRoomWallpaper(roomId, backgroundId, false)} />
          </Section>

          <Section index={1}>
            <div className="sc-appearance-sliders">
              <AppearanceSlider
                label={t('chat.appearance.dim')}
                valueLabel={`${appearance.overlayOpacity}%`}
                value={appearance.overlayOpacity}
                min={0}
                max={100}
                onChange={(value) => update({ overlayOpacity: value })}
              />
              <AppearanceSlider
                label={t('chat.appearance.blur')}
                valueLabel={appearance.overlayBlur === 0 ? t('chat.appearance.none') : `${appearance.overlayBlur}px`}
                value={appearance.overlayBlur}
                min={0}
                max={20}
                onChange={(value) => update({ overlayBlur: value })}
              />
            </div>
          </Section>

          <Section index={2} icon={<LuMessagesSquare size={15} aria-hidden="true" />} title={t('chat.appearance.bubbles')}>
            <AppearanceBubblePreview appearance={appearance} wallpaper={wallpaper} />
            <div className="sc-appearance-cards">
              <AppearanceBubbleCard
                label={t('chat.appearanceModal.sent')}
                colorLabel={t('chat.appearance.ownColor')}
                color={appearance.ownBubbleColor ?? toSixDigitHex(theme.messageOwn)}
                opacity={appearance.ownBubbleOpacity}
                textIntensity={appearance.ownTextIntensity}
                canReset={ownCanReset}
                onColorChange={(color) => update({ ownBubbleColor: color })}
                onOpacityChange={(value) => update({ ownBubbleOpacity: value })}
                onTextIntensityChange={(value) => update({ ownTextIntensity: value })}
                onReset={() =>
                  update({ ownBubbleColor: null, ownBubbleOpacity: DEFAULT_CHAT_APPEARANCE.ownBubbleOpacity, ownTextIntensity: null })
                }
              />
              <AppearanceBubbleCard
                label={t('chat.appearanceModal.received')}
                colorLabel={t('chat.appearance.otherColor')}
                color={appearance.otherBubbleColor ?? toSixDigitHex(theme.messageOther)}
                opacity={appearance.otherBubbleOpacity}
                textIntensity={appearance.otherTextIntensity}
                canReset={otherCanReset}
                onColorChange={(color) => update({ otherBubbleColor: color })}
                onOpacityChange={(value) => update({ otherBubbleOpacity: value })}
                onTextIntensityChange={(value) => update({ otherTextIntensity: value })}
                onReset={() =>
                  update({ otherBubbleColor: null, otherBubbleOpacity: DEFAULT_CHAT_APPEARANCE.otherBubbleOpacity, otherTextIntensity: null })
                }
              />
            </div>
            <AppearanceSlider
              label={t('chat.appearance.bubbleBlur')}
              valueLabel={appearance.bubbleBlur === 0 ? t('chat.appearance.none') : `${appearance.bubbleBlur}px`}
              value={appearance.bubbleBlur}
              min={0}
              max={20}
              onChange={(value) => update({ bubbleBlur: value })}
            />
          </Section>
        </div>

        <footer className="sc-appearance-footer">
          <button type="button" className="sc-appearance-action sc-appearance-action--danger" onClick={resetChat}>
            <LuRotateCcw size={15} aria-hidden="true" />
            {t('chat.appearanceModal.resetAll')}
          </button>
          <button type="button" className="sc-appearance-action" onClick={applyToAllChats} disabled={!hasPendingChanges}>
            <LuCheck size={15} aria-hidden="true" />
            {t('chat.appearance.applyAll')}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
