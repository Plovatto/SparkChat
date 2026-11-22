import type { MessageView } from '@lib/socket';

export interface ChatMessage extends MessageView {
  clientTempId?: string;
  renderKey?: string;
  messageId?: string;
  pending?: boolean;
  failed?: boolean;
  exiting?: boolean;
}
