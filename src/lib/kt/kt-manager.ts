import { getCurrentIdentity, subscribeCurrentIdentity } from '@lib/e2ee/current-identity';
import type { AppSocket, KtConfigPayload } from '@lib/socket';
import { resetKtAlerts, selectOwnerForAlerts } from './kt-alerts';
import { getKtSocketConfig, isValidLogPublicKey, setKtSocketConfig } from './kt-config';
import { gossipLatestHead, handleGossip, resetGossipState } from './kt-gossip';
import { refreshHead, resolveLogKey } from './kt-head';
import { runSelfAudit } from './kt-monitor';
import { resetKtVerificationCache } from './kt-verify';
import { checkWitness } from './kt-witness';

const FIRST_RUN_DELAY_MS = 6000;
const ROUND_INTERVAL_MS = 20 * 60 * 1000;

export async function runTransparencyRound(socket: AppSocket): Promise<void> {
  const identity = getCurrentIdentity();
  const config = getKtSocketConfig(socket);
  if (!identity || !config) {
    return;
  }
  const resolution = resolveLogKey(identity.userId, config);
  if (!resolution.ok) {
    return;
  }
  await refreshHead(socket, identity.userId, resolution.logPublicKey);
  await runSelfAudit(socket);
  await checkWitness(socket);
  await gossipLatestHead(socket);
}

export function attachKeyTransparency(socket: AppSocket): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let configured = false;

  const stop = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const round = () => {
    if (running) {
      return;
    }
    running = true;
    runTransparencyRound(socket)
      .catch((error: unknown) => console.error('[kt] round failed', error))
      .finally(() => {
        running = false;
      });
  };

  const start = () => {
    if (!configured || !getCurrentIdentity() || timer || interval) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      round();
      interval = setInterval(round, ROUND_INTERVAL_MS);
    }, FIRST_RUN_DELAY_MS);
  };

  const handleConfig = (payload: KtConfigPayload) => {
    if (payload?.enabled === true && isValidLogPublicKey(payload.logPublicKey)) {
      setKtSocketConfig(socket, { logPublicKey: payload.logPublicKey });
      configured = true;
      start();
    } else {
      setKtSocketConfig(socket, null);
      configured = false;
      stop();
    }
  };

  const handleGossipEvent = (payload: { from: string; envelope: string }) => {
    handleGossip(socket, payload).catch((error: unknown) => console.error('[kt] gossip failed', error));
  };

  socket.on('kt:config', handleConfig);
  socket.on('kt:gossip', handleGossipEvent);

  const unsubscribeIdentity = subscribeCurrentIdentity((identity) => {
    if (identity) {
      if (configured) {
        selectOwnerForAlerts(identity.userId);
        start();
      }
    } else {
      stop();
      resetKtVerificationCache();
      resetGossipState();
      resetKtAlerts();
    }
  });

  return () => {
    stop();
    unsubscribeIdentity();
    socket.off('kt:config', handleConfig);
    socket.off('kt:gossip', handleGossipEvent);
    setKtSocketConfig(socket, null);
  };
}
