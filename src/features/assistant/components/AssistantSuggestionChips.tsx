import { useTranslation } from 'react-i18next';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { ASSISTANT_CHIP_IDS, type AssistantChipId } from '../assistant-chips';
import '../styles/assistant.css';

interface AssistantSuggestionChipsProps {
  visible: boolean;
  onPick: (id: AssistantChipId, prompt: string) => void;
}

export function AssistantSuggestionChips({ visible, onPick }: AssistantSuggestionChipsProps) {
  const { t } = useTranslation();
  const presence = usePresence(visible, MOTION_DURATION_MS.fast);

  if (!presence.isPresent) {
    return null;
  }

  return (
    <div className="sc-assistant-chips-wrap" data-exiting={presence.isExiting ? 'true' : undefined}>
      <div className="sc-assistant-chips" role="group" aria-label={t('chat.assistant.chips.label')}>
        {ASSISTANT_CHIP_IDS.map((id, index) => (
          <button
            key={id}
            type="button"
            className="sc-assistant-chip"
            style={{ animationDelay: `${index * 40}ms` }}
            onClick={() => onPick(id, t(`chat.assistant.prompts.${id}`))}
          >
            {t(`chat.assistant.chips.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
