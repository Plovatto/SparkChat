import type { QuickReply } from '@features/assistant/assistant-card';
import type { MessageView } from '@lib/socket';

export interface ChatMessage extends MessageView {
  clientTempId?: string;
  renderKey?: string;
  messageId?: string;
  quickReply?: QuickReply;
  pending?: boolean;
  failed?: boolean;
  exiting?: boolean;
}
