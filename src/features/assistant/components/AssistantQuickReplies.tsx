import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantButton, QuickReplyChoice } from '@lib/assistant/assistant-card';
import { quickReplyVariant } from '../quick-reply-variant';
import '../styles/assistant.css';

const SEND_TIMEOUT_MS = 15000;

interface AssistantQuickRepliesProps {
  buttons: AssistantButton[];
  resolvedChoice?: QuickReplyChoice | undefined;
  failureToken?: string | undefined;
  onSelect: (button: AssistantButton) => void;
}

export function AssistantQuickReplies({ buttons, resolvedChoice, failureToken, onSelect }: AssistantQuickRepliesProps) {
  const { t } = useTranslation();
  const [sentChoice, setSentChoice] = useState<QuickReplyChoice | null>(null);

  useEffect(() => {
    if (resolvedChoice) {
      setSentChoice(null);
    }
  }, [resolvedChoice]);

  useEffect(() => {
    if (failureToken) {
      setSentChoice(null);
    }
  }, [failureToken]);

  useEffect(() => {
    if (sentChoice === null) {
      return;
    }
    const timeout = window.setTimeout(() => setSentChoice(null), SEND_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [sentChoice]);

  if (buttons.length === 0) {
    return null;
  }

  if (resolvedChoice) {
    const chosen = buttons.find((button) => button.choice === resolvedChoice);
    return (
      <div className="sc-assistant-resolved" data-testid="assistant-resolved" role="status">
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
          data-variant={quickReplyVariant(button.choice)}
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
