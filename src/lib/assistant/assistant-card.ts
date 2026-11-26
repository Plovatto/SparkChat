export const QUICK_REPLY_CHOICES = ['yes', 'no', 'another', 'undo', 'done', 'snooze10', 'snooze60', 'send-now', 'keep'] as const;

export type QuickReplyChoice = (typeof QUICK_REPLY_CHOICES)[number];

export interface QuickReply {
  cardId: string;
  choice: QuickReplyChoice;
}

export interface AssistantLook {
  baseTheme?: string;
  colorTheme?: string;
  wallpaper?: string;
  appearance?: Partial<{
    overlayOpacity: number;
    overlayBlur: number;
    ownBubbleColor: string | null;
    ownBubbleOpacity: number;
    ownTextIntensity: number | null;
    otherBubbleColor: string | null;
    otherBubbleOpacity: number;
    otherTextIntensity: number | null;
    bubbleBlur: number;
  }>;
}

export interface AssistantButton {
  choice: QuickReplyChoice;
  label: string;
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  weekdays?: number[];
  interval?: number;
}

export type ConfirmAction =
  | { type: 'reminder'; text: string; fireAtLocal: string; timeZone: string; recurrence: Recurrence | null }
  | { type: 'status'; text: string; untilLocal: string; timeZone: string }
  | { type: 'scheduled-message'; roomId: string; recipient: string; text: string; sendAtLocal: string; timeZone: string }
  | { type: 'delete-note'; noteId: string; preview: string }
  | { type: 'cancel-reminder'; reminderId: string; preview: string };

export interface AssistantListItem {
  id: string;
  text: string;
  detail?: string;
}

export type AssistantCard =
  | { v: 1; kind: 'look-suggestion'; look: AssistantLook; buttons: AssistantButton[] }
  | { v: 1; kind: 'look-applied'; look: AssistantLook; previous: AssistantLook; buttons: AssistantButton[] }
  | { v: 1; kind: 'confirm'; action: ConfirmAction; buttons: AssistantButton[] }
  | { v: 1; kind: 'reminder-fired'; reminderId: string; text: string; buttons: AssistantButton[] }
  | { v: 1; kind: 'scheduled-failed'; roomId: string; text: string; buttons: AssistantButton[] }
  | { v: 1; kind: 'list'; title: string; items: AssistantListItem[] }
  | { v: 1; kind: 'capabilities' }
  | { v: 1; kind: 'choices'; buttons: AssistantButton[] };

const BUTTON_KINDS: ReadonlySet<string> = new Set(['look-suggestion', 'look-applied', 'confirm', 'reminder-fired', 'scheduled-failed', 'choices']);
const KNOWN_KINDS: ReadonlySet<string> = new Set([...BUTTON_KINDS, 'list', 'capabilities']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChoice(value: unknown): value is QuickReplyChoice {
  return typeof value === 'string' && (QUICK_REPLY_CHOICES as readonly string[]).includes(value);
}

function areValidButtons(value: unknown): value is AssistantButton[] {
  return (
    Array.isArray(value) &&
    value.every((button) => isRecord(button) && isChoice(button.choice) && typeof button.label === 'string' && button.label.length > 0)
  );
}

function areValidItems(value: unknown): value is AssistantListItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) && typeof item.id === 'string' && typeof item.text === 'string' && (item.detail === undefined || typeof item.detail === 'string'),
    )
  );
}

export function parseAssistantCard(raw: unknown): AssistantCard | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || value.v !== 1 || typeof value.kind !== 'string' || !KNOWN_KINDS.has(value.kind)) {
    return null;
  }
  if (BUTTON_KINDS.has(value.kind) && !areValidButtons(value.buttons)) {
    return null;
  }
  if (value.kind === 'list' && (typeof value.title !== 'string' || !areValidItems(value.items))) {
    return null;
  }
  if (value.kind === 'confirm' && (!isRecord(value.action) || typeof value.action.type !== 'string')) {
    return null;
  }
  return value as unknown as AssistantCard;
}

export function cardButtons(card: AssistantCard): AssistantButton[] {
  return 'buttons' in card ? card.buttons : [];
}
