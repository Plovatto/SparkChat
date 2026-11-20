import { getCurrentIdentity, subscribeCurrentIdentity } from '@lib/e2ee/current-identity';
import type { AppSocket, KtConfigPayload } from '@lib/socket';
import { raiseKtAlert, resetKtAlerts, selectOwnerForAlerts } from './kt-alerts';
import { KT_CONFIG_DEADLINE_MS, getKtSocketConfig, isValidLogPublicKey, ktAuthenticatedAt, markKtAuthenticated, markKtDisabled, setKtSocketConfig } from './kt-config';
import { gossipLatestHead, handleGossip, resetGossipState } from './kt-gossip';
import { expectsKt, refreshHead, resolveLogKey, retryCandidateHead } from './kt-head';
import { resetKtHealth } from './kt-health';
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
  await retryCandidateHead(socket, identity.userId, resolution.logPublicKey);
  await refreshHead(socket, identity.userId, resolution.logPublicKey);
  await runSelfAudit(socket);
  await checkWitness(socket);
  await gossipLatestHead(socket);
}

export function checkDowngrade(socket: AppSocket, now: number = Date.now()): boolean {
  const identity = getCurrentIdentity();
  if (!identity || getKtSocketConfig(socket) || !expectsKt(identity.userId)) {
    return false;
  }
  const since = ktAuthenticatedAt(socket);
  if (since === null || now - since < KT_CONFIG_DEADLINE_MS) {
    return false;
  }
  selectOwnerForAlerts(identity.userId);
  raiseKtAlert(identity.userId, 'downgrade', 'downgrade');
  return true;
}

export function attachKeyTransparency(socket: AppSocket): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let configured = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

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
      markKtDisabled(socket);
      configured = false;
      stop();
      const identity = getCurrentIdentity();
      if (identity && expectsKt(identity.userId)) {
        selectOwnerForAlerts(identity.userId);
        raiseKtAlert(identity.userId, 'downgrade', 'downgrade');
      }
    }
  };

  const handleAuthenticated = () => {
    markKtAuthenticated(socket);
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
    }
    deadlineTimer = setTimeout(() => {
      deadlineTimer = null;
      checkDowngrade(socket);
    }, KT_CONFIG_DEADLINE_MS + 50);
  };

  const handleGossipEvent = (payload: { from: string; envelope: string }) => {
    handleGossip(socket, payload).catch((error: unknown) => console.error('[kt] gossip failed', error));
  };

  socket.on('kt:config', handleConfig);
  socket.on('user:resumed', handleAuthenticated);
  socket.on('user:registered', handleAuthenticated);
  socket.on('kt:gossip', handleGossipEvent);

  const unsubscribeIdentity = subscribeCurrentIdentity((identity) => {
    if (identity) {
      if (configured) {
        selectOwnerForAlerts(identity.userId);
        start();
      } else {
        checkDowngrade(socket);
      }
    } else {
      stop();
      resetKtHealth();
      resetKtVerificationCache();
      resetGossipState();
      resetKtAlerts();
    }
  });

  return () => {
    stop();
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
    }
    unsubscribeIdentity();
    socket.off('kt:config', handleConfig);
    socket.off('user:resumed', handleAuthenticated);
    socket.off('user:registered', handleAuthenticated);
    socket.off('kt:gossip', handleGossipEvent);
    setKtSocketConfig(socket, null);
  };
}
