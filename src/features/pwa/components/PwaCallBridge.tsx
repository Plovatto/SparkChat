import { useEffect } from 'react';
import { queueNotificationCallAction } from '@features/calls';
import { consumeArmedAnswer } from '../lib/armed-answer';
import { takePendingAnswer } from '../lib/launch-params';
import { onWorkerMessage } from '../lib/sw-registration';
import { SW_SCOPE } from '../sw/protocol';

function browserCaches(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

export function PwaCallBridge() {
  useEffect(() => {
    const answerCallId = takePendingAnswer();
    if (!answerCallId) {
      return;
    }
    const scope = new URL(SW_SCOPE, window.location.origin).toString();
    void consumeArmedAnswer(browserCaches(), scope, answerCallId, Date.now()).then((armed) => {
      if (armed) {
        queueNotificationCallAction({ type: 'answer', callId: answerCallId });
      }
    });
  }, []);

  useEffect(
    () =>
      onWorkerMessage((message) => {
        if (message.type === 'sparkchat:call-decline') {
          queueNotificationCallAction({ type: 'decline', callId: message.callId });
        } else if (message.type === 'sparkchat:open-room' && message.callId) {
          queueNotificationCallAction({ type: 'answer', callId: message.callId });
        }
      }),
    [],
  );

  return null;
}
