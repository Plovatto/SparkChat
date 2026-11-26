import { useTranslation } from 'react-i18next';
import type { HelpTarget } from '@lib/assistant/assistant-card';
import { openHelpTarget, useCanOpenHelpTarget } from '../help-targets';
import '../styles/assistant.css';

interface AssistantHelpCardProps {
  target: HelpTarget;
}

export function AssistantHelpCard({ target }: AssistantHelpCardProps) {
  const { t } = useTranslation();
  const canOpen = useCanOpenHelpTarget(target);

  if (!canOpen) {
    return null;
  }

  return (
    <div className="sc-assistant-card">
      <div className="sc-assistant-replies">
        <button type="button" className="sc-assistant-reply" onClick={() => openHelpTarget(target)}>
          {t('chat.assistant.help.open')}
        </button>
      </div>
    </div>
  );
}
