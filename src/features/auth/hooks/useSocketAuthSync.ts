import { useCallback, useEffect, useRef } from 'react';
import { translateErrorPayload, type ApiErrorPayload } from '@lib/api/api-error';
import { adjustClockOffset, buildSocketJoinProof, completeLoginDeviceKey, prepareLoginDeviceKey } from '@lib/api/device-key';
import { ensureSessionDeviceKey } from '@lib/api/session-auth';
import { useSocket, type AuthMethod, type SocketUser } from '@lib/socket';
import { ATTENTION_EVENTS, createAttentionTracker, type AttentionState } from '../lib/attention-tracker';
import type { PendingRegistration, User } from '../types';

export interface RegisteredPayload {
  user: SocketUser;
  sessionToken: string;
  authMethod: AuthMethod;
  deviceKeyBound?: boolean;
}

export interface ResumedPayload {
  user: SocketUser;
  authMethod: AuthMethod;
}

export interface AuthFailedPayload extends ApiErrorPayload {
  mode: 'register' | 'resume';
  reason: 'invalid' | 'temporary';
}

export interface SocketAuthSyncOptions {
  user: User | null;
  pendingRegistration: PendingRegistration | null;
  onRegistered: (payload: RegisteredPayload, registration: PendingRegistration | null) => void;
  onResumed: (payload: ResumedPayload) => void;
  onResumeFailed: () => void;
  onRegisterFailed: (message: string) => void;
  onSessionRevoked: () => void;
}

const AUTH_RETRY_DELAY_MS = 2000;

type VisibilitySocket = { emit: (event: 'user:visibility', payload: AttentionState) => unknown };

export function reportBackgroundAfterAuth(socket: VisibilitySocket, visibilityState: DocumentVisibilityState, attentive = visibilityState === 'visible'): void {
  if (visibilityState === 'hidden') {
    socket.emit('user:visibility', { visible: false, attentive: false });
    return;
  }
  if (!attentive) {
    socket.emit('user:visibility', { visible: true, attentive: false });
  }
}
const LIVENESS_PROBE_TIMEOUT_MS = 3000;

export function useSocketAuthSync({
  user,
  pendingRegistration,
  onRegistered,
  onResumed,
  onResumeFailed,
  onRegisterFailed,
  onSessionRevoked,
}: SocketAuthSyncOptions): void {
  const { socket } = useSocket();
  const credentialsRef = useRef({ user, pendingRegistration });
  const retryTimeoutRef = useRef<number | null>(null);
  const emitJoinRef = useRef<() => void>(() => undefined);
  const registrationKeyRef = useRef<string | null>(null);
  const rejectedResumesRef = useRef(0);

  credentialsRef.current = { user, pendingRegistration };

  const identityKey = user ? `resume:${user.id}` : pendingRegistration ? `register:${pendingRegistration.nickname}` : null;

  const clearRetry = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!socket || !identityKey) {
      return;
    }

    const emitResume = async (currentUser: User) => {
      const auth = { userId: currentUser.id, sessionToken: currentUser.sessionToken };
      await ensureSessionDeviceKey(auth);
      const proof = await buildSocketJoinProof(currentUser.id);
      if (credentialsRef.current.user?.sessionToken !== currentUser.sessionToken || !socket.connected) {
        return;
      }
      socket.emit('user:join', { mode: 'resume', ...auth, ...(proof ? { proof } : {}) });
    };

    const emitRegister = async (currentRegistration: PendingRegistration) => {
      const devicePublicKey = await prepareLoginDeviceKey();
      if (credentialsRef.current.pendingRegistration !== currentRegistration || !socket.connected) {
        return;
      }
      registrationKeyRef.current = devicePublicKey;
      socket.emit('user:join', {
        mode: 'register',
        nickname: currentRegistration.nickname,
        avatar: currentRegistration.avatar,
        password: currentRegistration.credentials.authKey,
        authSalt: currentRegistration.credentials.authSalt,
        recoveryVerifier: currentRegistration.credentials.recoveryVerifier,
        passwordLength: currentRegistration.credentials.passwordLength,
        ...(devicePublicKey ? { devicePublicKey } : {}),
      });
    };

    const emitJoin = () => {
      const { user: currentUser, pendingRegistration: currentRegistration } = credentialsRef.current;

      if (currentUser) {
        void emitResume(currentUser);
        return;
      }

      if (currentRegistration) {
        void emitRegister(currentRegistration);
      }
    };

    emitJoinRef.current = emitJoin;

    const handleConnect = () => {
      rejectedResumesRef.current = 0;
      emitJoin();
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
      clearRetry();
    };
  }, [socket, identityKey, clearRetry]);

  useEffect(() => {
    if (!socket || !user) {
      return;
    }

    let probeTimer: number | null = null;

    const tracker = createAttentionTracker({
      now: () => Date.now(),
      isVisible: () => document.visibilityState === 'visible',
      hasFocus: () => document.hasFocus(),
      onChange: (state) => {
        if (socket.connected) {
          socket.emit('user:visibility', state);
        }
      },
    });

    const handleVisibilityChange = () => {
      const state = tracker.report();

      if (!state.visible) {
        socket.emit('user:visibility', state);
        return;
      }

      if (!socket.connected) {
        socket.connect();
        return;
      }

      let acknowledged = false;
      if (probeTimer !== null) {
        window.clearTimeout(probeTimer);
      }
      probeTimer = window.setTimeout(() => {
        probeTimer = null;
        if (!acknowledged && socket.connected) {
          socket.disconnect().connect();
        }
      }, LIVENESS_PROBE_TIMEOUT_MS);

      socket.emit('user:visibility', state, () => {
        acknowledged = true;
      });
    };

    const handleAuthenticated = () => {
      const state = tracker.report();
      reportBackgroundAfterAuth(socket, document.visibilityState, state.attentive);
    };
    const handleInteraction = () => tracker.interact();
    const handleFocusChange = () => tracker.refresh();

    handleVisibilityChange();
    socket.on('user:resumed', handleAuthenticated);
    socket.on('user:registered', handleAuthenticated);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    window.addEventListener('online', handleVisibilityChange);
    window.addEventListener('blur', handleFocusChange);
    ATTENTION_EVENTS.forEach((type) => window.addEventListener(type, handleInteraction, { passive: true, capture: true }));
    return () => {
      tracker.dispose();
      if (probeTimer !== null) {
        window.clearTimeout(probeTimer);
      }
      socket.off('user:resumed', handleAuthenticated);
      socket.off('user:registered', handleAuthenticated);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      window.removeEventListener('online', handleVisibilityChange);
      window.removeEventListener('blur', handleFocusChange);
      ATTENTION_EVENTS.forEach((type) => window.removeEventListener(type, handleInteraction, { capture: true }));
    };
  }, [socket, user]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleRegistered = (payload: RegisteredPayload) => {
      clearRetry();
      const registration = credentialsRef.current.pendingRegistration;
      const devicePublicKey = registrationKeyRef.current;
      registrationKeyRef.current = null;
      void completeLoginDeviceKey(payload.user.id, devicePublicKey, payload.deviceKeyBound === true).finally(() => {
        onRegistered(payload, registration);
      });
    };

    const handleResumed = (payload: ResumedPayload) => {
      clearRetry();
      rejectedResumesRef.current = 0;
      onResumed(payload);
    };

    const scheduleRejoin = () => {
      clearRetry();
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        if (socket.connected) {
          emitJoinRef.current();
        }
      }, AUTH_RETRY_DELAY_MS);
    };

    const handleAuthFailed = ({ mode, reason, ...error }: AuthFailedPayload) => {
      const serverTime = error.params?.serverTime;
      if (error.code === 'auth.signatureStale' && typeof serverTime === 'number') {
        adjustClockOffset(serverTime);
      }

      if (reason === 'temporary') {
        scheduleRejoin();
        return;
      }

      if (mode === 'register') {
        clearRetry();
        onRegisterFailed(translateErrorPayload(error, 'errors.generic'));
        return;
      }

      if (rejectedResumesRef.current === 0) {
        rejectedResumesRef.current = 1;
        scheduleRejoin();
        return;
      }

      clearRetry();
      onResumeFailed();
    };

    const handleSessionRevoked = () => {
      clearRetry();
      onSessionRevoked();
    };

    socket.on('user:registered', handleRegistered);
    socket.on('user:resumed', handleResumed);
    socket.on('user:auth-failed', handleAuthFailed);
    socket.on('user:session-revoked', handleSessionRevoked);

    return () => {
      socket.off('user:registered', handleRegistered);
      socket.off('user:resumed', handleResumed);
      socket.off('user:auth-failed', handleAuthFailed);
      socket.off('user:session-revoked', handleSessionRevoked);
    };
  }, [socket, onRegistered, onResumed, onResumeFailed, onRegisterFailed, onSessionRevoked, clearRetry]);
}
