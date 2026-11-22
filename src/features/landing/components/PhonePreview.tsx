import { useTranslation } from 'react-i18next';
import { FaArrowLeft, FaMicrophone, FaPaperclip } from 'react-icons/fa';
import { DemoAvatar } from './DemoAvatar';

interface PhonePreviewProps {
  wallpaper: string | null;
  colorName: string;
  modePhrase: string;
}

export function PhonePreview({ wallpaper, colorName, modePhrase }: PhonePreviewProps) {
  const { t } = useTranslation('landing');
  const values = { color: colorName, mode: modePhrase };

  return (
    <div className="lp-phone" role="img" aria-label={t('preview.phoneLabel', values)}>
      <div className="lp-phone__screen" aria-hidden="true">
        <div className="lp-phone__header">
          <span className="lp-window__round">
            <FaArrowLeft size={11} />
          </span>
          <DemoAvatar name="Robot" size={34} online />
          <div className="lp-window__chat-title">
            <strong>SparkAI</strong>
            <span>{t('preview.assistantStatus')}</span>
          </div>
        </div>

        <div className="lp-phone__messages">
          {wallpaper && <span key={wallpaper} className="lp-phone__wall" style={{ background: wallpaper, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
          <div className="lp-bubble" data-own="false">
            {t('preview.phoneWelcome')}
            <span className="lp-bubble__meta">09:41</span>
          </div>
          <div className="lp-bubble" data-own="true">
            {t('preview.phoneAsk')}
            <span className="lp-bubble__meta">09:42</span>
          </div>
          <div className="lp-bubble" data-own="false">
            {t('preview.phoneReply', values)}
            <span className="lp-bubble__meta">09:42</span>
          </div>
        </div>

        <div className="lp-window__composer">
          <span className="lp-window__round lp-window__round--soft">
            <FaPaperclip size={11} />
          </span>
          <span className="lp-window__round lp-window__round--soft">
            <FaMicrophone size={11} />
          </span>
          <span className="lp-window__input">{t('preview.phoneComposer')}</span>
        </div>
      </div>
    </div>
  );
}
