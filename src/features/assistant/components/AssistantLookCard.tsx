import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantLook } from '@lib/assistant/assistant-card';
import { AssistantLookPreview } from './AssistantLookPreview';

interface AssistantLookCardProps {
  look: AssistantLook;
  applied: boolean;
  replies: ReactNode;
}

export function AssistantLookCard({ look, applied, replies }: AssistantLookCardProps) {
  const { t } = useTranslation();
  return (
    <div className="sc-assistant-card sc-assistant-card-look">
      <AssistantLookPreview
        look={look}
        kicker={t(applied ? 'chat.assistant.card.lookApplied' : 'chat.assistant.card.lookSuggestion')}
      />
      <div className="sc-assistant-look-actions">{replies}</div>
    </div>
  );
}
