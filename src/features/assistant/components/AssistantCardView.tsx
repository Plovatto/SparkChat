import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatLocalDateTime } from '@lib/format/date';
import { cardButtons, type AssistantButton, type AssistantCard, type ConfirmAction, type QuickReplyChoice } from '@lib/assistant/assistant-card';
import { AssistantCapabilities } from './AssistantCapabilities';
import { AssistantHelpCard } from './AssistantHelpCard';
import { AssistantLookCard } from './AssistantLookCard';
import { AssistantQuickReplies } from './AssistantQuickReplies';
import '../styles/assistant.css';

interface AssistantCardViewProps {
  card: AssistantCard;
  cardId: string;
  resolvedChoice?: QuickReplyChoice | undefined;
  failureToken?: string | undefined;
  error?: string | undefined;
  onQuickReply: (cardId: string, button: AssistantButton) => void;
  onSendPrompt?: ((text: string) => void) | undefined;
  onPickPhoto?: (() => void) | undefined;
}

function confirmSummary(action: ConfirmAction, t: TFunction<'app'>): string {
  switch (action.type) {
    case 'reminder':
      return t('chat.assistant.card.confirmReminder', { text: action.text, when: formatLocalDateTime(action.fireAtLocal) });
    case 'status':
      return t('chat.assistant.card.confirmStatus', { text: action.text, when: formatLocalDateTime(action.untilLocal) });
    case 'scheduled-message':
      return t('chat.assistant.card.confirmScheduled', {
        recipient: action.recipient,
        text: action.text,
        when: formatLocalDateTime(action.sendAtLocal),
      });
    case 'delete-note':
      return t('chat.assistant.card.confirmDeleteNote', { preview: action.preview });
    case 'cancel-reminder':
      return t('chat.assistant.card.confirmCancelReminder', { preview: action.preview });
  }
}

export function AssistantCardView({ card, cardId, resolvedChoice, failureToken, error, onQuickReply, onSendPrompt, onPickPhoto }: AssistantCardViewProps) {
  const { t } = useTranslation();
  const buttons = cardButtons(card);
  const replies =
    buttons.length > 0 ? (
      <>
        <AssistantQuickReplies buttons={buttons} resolvedChoice={resolvedChoice} failureToken={failureToken} onSelect={(button) => onQuickReply(cardId, button)} />
        {error && !resolvedChoice && (
          <p className="sc-assistant-card-error" role="alert">
            {error}
          </p>
        )}
      </>
    ) : null;

  switch (card.kind) {
    case 'confirm':
      return (
        <div className="sc-assistant-card">
          <p className="sc-assistant-card-summary">{confirmSummary(card.action, t)}</p>
          {replies}
        </div>
      );
    case 'list':
      return (
        <div className="sc-assistant-card">
          <p className="sc-assistant-card-title">{card.title}</p>
          <ul className="sc-assistant-list">
            {card.items.map((item) => (
              <li key={item.id} className="sc-assistant-list-item">
                <span>{item.text}</span>
                {item.detail && <span className="sc-assistant-list-detail">{item.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'capabilities':
      return (
        <div className="sc-assistant-card sc-assistant-card-caps">
          <AssistantCapabilities onSendPrompt={onSendPrompt} onPickPhoto={onPickPhoto} />
        </div>
      );
    case 'look-suggestion':
      return <AssistantLookCard look={card.look} applied={false} replies={replies} />;
    case 'look-applied':
      return <AssistantLookCard look={card.look} applied replies={replies} />;
    case 'reminder-fired':
      return (
        <div className="sc-assistant-card sc-assistant-card-reminder" data-testid="assistant-reminder-card">
          <div className="sc-assistant-reminder-head">
            <span className="sc-assistant-reminder-bell" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </span>
            <div className="sc-assistant-reminder-body">
              <span className="sc-assistant-reminder-label">{t('chat.assistant.card.reminderFired')}</span>
              <p className="sc-assistant-reminder-text">{card.text}</p>
            </div>
          </div>
          {replies}
        </div>
      );
    case 'help':
      return <AssistantHelpCard target={card.target} />;
    default:
      return replies ? <div className="sc-assistant-card">{replies}</div> : null;
  }
}
