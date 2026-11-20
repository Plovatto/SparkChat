import type { AppSocket } from '@lib/socket';
import type { ClientToServerEvents, ServerToClientEvents } from '@lib/socket/socket-events';

export class KtUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KtUnavailableError';
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
let counter = 0;

type RequestEvent = 'kt:get-head' | 'kt:get-proofs' | 'kt:get-consistency' | 'kt:audit';
type ReplyEvent = 'kt:head' | 'kt:proofs' | 'kt:consistency' | 'kt:audit';
type ReplyPayload<E extends ReplyEvent> = Parameters<ServerToClientEvents[E]>[0];
type RequestPayload<E extends RequestEvent> = NonNullable<Parameters<ClientToServerEvents[E]>[0]>;

type LooseSocket = {
  on: (event: string, handler: (payload: unknown) => void) => unknown;
  off: (event: string, handler: (payload: unknown) => void) => unknown;
  emit: (event: string, payload: unknown) => unknown;
  connected: boolean;
};

function nextRequestId(): string {
  counter += 1;
  return `kt-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function ktRequest<Q extends RequestEvent, R extends ReplyEvent>(
  socket: AppSocket,
  event: Q,
  reply: R,
  payload: Omit<RequestPayload<Q>, 'requestId'>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ReplyPayload<R>> {
  const loose = socket as unknown as LooseSocket;
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId();
    let settled = false;

    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      loose.off(reply, onReply);
      loose.off('error', onError);
    };

    const onReply = (data: unknown) => {
      if (settled || typeof data !== 'object' || data === null || (data as { requestId?: unknown }).requestId !== requestId) {
        return;
      }
      cleanup();
      resolve(data as ReplyPayload<R>);
    };

    const onError = (data: unknown) => {
      if (settled || typeof data !== 'object' || data === null || (data as { event?: unknown }).event !== event) {
        return;
      }
      cleanup();
      reject(new KtUnavailableError(`${event} failed`));
    };

    loose.on(reply, onReply);
    loose.on('error', onError);
    const timer = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new KtUnavailableError(`${event} timed out`));
      }
    }, timeoutMs);

    if (!loose.connected) {
      cleanup();
      reject(new KtUnavailableError('socket disconnected'));
      return;
    }
    loose.emit(event, { ...payload, requestId });
  });
}
