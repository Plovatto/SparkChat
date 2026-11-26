import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { cardButtons, type AssistantButton, type AssistantCard, type ConfirmAction, type QuickReplyChoice } from '../assistant-card';
import { AssistantQuickReplies } from './AssistantQuickReplies';
import '../styles/assistant.css';

interface AssistantCardViewProps {
  card: AssistantCard;
  cardId: string;
  resolvedChoice?: QuickReplyChoice | undefined;
  onQuickReply: (cardId: string, button: AssistantButton) => void;
}

function formatLocal(value: string): string {
  return value.replace('T', ' ');
}

function confirmSummary(action: ConfirmAction, t: TFunction<'app'>): string {
  switch (action.type) {
    case 'reminder':
      return t('chat.assistant.card.confirmReminder', { text: action.text, when: formatLocal(action.fireAtLocal) });
    case 'status':
      return t('chat.assistant.card.confirmStatus', { text: action.text, when: formatLocal(action.untilLocal) });
    case 'scheduled-message':
      return t('chat.assistant.card.confirmScheduled', {
        recipient: action.recipient,
        text: action.text,
        when: formatLocal(action.sendAtLocal),
      });
    case 'delete-note':
      return t('chat.assistant.card.confirmDeleteNote', { preview: action.preview });
    case 'cancel-reminder':
      return t('chat.assistant.card.confirmCancelReminder', { preview: action.preview });
  }
}

export function AssistantCardView({ card, cardId, resolvedChoice, onQuickReply }: AssistantCardViewProps) {
  const { t } = useTranslation();
  const buttons = cardButtons(card);
  const replies =
    buttons.length > 0 ? (
      <AssistantQuickReplies buttons={buttons} resolvedChoice={resolvedChoice} onSelect={(button) => onQuickReply(cardId, button)} />
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
    default:
      return replies ? <div className="sc-assistant-card">{replies}</div> : null;
  }
}
