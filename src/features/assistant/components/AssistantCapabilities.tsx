import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ASSISTANT_CAPABILITY_ICONS, ASSISTANT_CAPABILITY_IDS, type AssistantCapabilityId } from '../assistant-capabilities';
import '../styles/assistant.css';

interface AssistantCapabilitiesProps {
  onSendPrompt?: ((text: string) => void) | undefined;
  onPickPhoto?: (() => void) | undefined;
}

function keepEmojiWithLastWord(title: string): string {
  return title.replace(/ (\S+)$/, '\u00a0$1');
}

export function AssistantCapabilities({ onSendPrompt, onPickPhoto }: AssistantCapabilitiesProps) {
  const { t } = useTranslation();

  const handlePick = (id: AssistantCapabilityId) => {
    if (id === 'photoTheme' && onPickPhoto) {
      onPickPhoto();
      return;
    }
    onSendPrompt?.(t(`chat.assistant.capabilities.${id}.example`));
  };

  return (
    <ul className="sc-assistant-caps" aria-label={t('chat.assistant.capabilities.label')}>
      {ASSISTANT_CAPABILITY_IDS.map((id, index) => {
        const Icon = ASSISTANT_CAPABILITY_ICONS[id];
        return (
          <li key={id} className="sc-assistant-cap-item" style={{ '--i': index } as CSSProperties}>
            <button type="button" className="sc-assistant-cap" onClick={() => handlePick(id)}>
              <span className="sc-assistant-cap-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="sc-assistant-cap-text">
                <span className="sc-assistant-cap-title">{keepEmojiWithLastWord(t(`chat.assistant.capabilities.${id}.title`))}</span>
                <span className="sc-assistant-cap-desc">{t(`chat.assistant.capabilities.${id}.description`)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
