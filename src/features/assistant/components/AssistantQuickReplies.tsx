import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantButton, QuickReplyChoice } from '../assistant-card';
import '../styles/assistant.css';

interface AssistantQuickRepliesProps {
  buttons: AssistantButton[];
  resolvedChoice?: QuickReplyChoice | undefined;
  onSelect: (button: AssistantButton) => void;
}

export function AssistantQuickReplies({ buttons, resolvedChoice, onSelect }: AssistantQuickRepliesProps) {
  const { t } = useTranslation();
  const [sentChoice, setSentChoice] = useState<QuickReplyChoice | null>(null);

  useEffect(() => {
    if (resolvedChoice) {
      setSentChoice(null);
    }
  }, [resolvedChoice]);

  if (buttons.length === 0) {
    return null;
  }

  if (resolvedChoice) {
    const chosen = buttons.find((button) => button.choice === resolvedChoice);
    return (
      <div className="sc-assistant-resolved" data-testid="assistant-resolved">
        {t('chat.assistant.card.resolved', { label: chosen?.label ?? resolvedChoice })}
      </div>
    );
  }

  return (
    <div className="sc-assistant-replies" role="group" aria-label={t('chat.assistant.card.choicesLabel')}>
      {buttons.map((button, index) => (
        <button
          key={button.choice}
          type="button"
          className="sc-assistant-reply"
          style={{ animationDelay: `${index * 50}ms` }}
          disabled={sentChoice !== null}
          data-sent={sentChoice === button.choice ? 'true' : undefined}
          onClick={() => {
            setSentChoice(button.choice);
            onSelect(button);
          }}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
