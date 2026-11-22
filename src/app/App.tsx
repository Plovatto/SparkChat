import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Col, Container, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { LuWifiOff } from 'react-icons/lu';
import { LoadingScreen } from '@components/common/LoadingScreen';
import { RecoveryFileDownloadDialog } from '@components/common/RecoveryFileDownloadDialog';
import { minWidthQuery, SPLIT_LAYOUT_MIN_WIDTH_PX } from '@constants/breakpoints';
import {
  ChatArea,
  isAssistantRoom,
  useChatTriggerEffects,
  useEnsureAssistantChat,
} from '@features/chat';
import { LoginScreen, rememberAuthParams, revokeServerSession, useAuthSession, useLoginTheme, useSocketAuthSync } from '@features/auth';
import type { PendingE2eCredential, PendingRegistration, User } from '@features/auth';
import {
  attestGroupAction,
  completeRegistration,
  ensureIdentityAfterPasswordLoginV2,
  ensureIdentityAfterRecoveryLogin,
  hydrateCurrentIdentity,
  prepareInviteJoin,
} from '@lib/e2ee';
import {
  useAudioContextPrimer,
  useMessageNotifications,
  useNotificationContentPreference,
  useNotificationPreference,
  useSoundPreference,
  useUnreadBadge,
} from '@features/notifications';
import { CallProvider } from '@features/calls';
import { KeyTransparencyBanner } from '@features/key-transparency';
import { PendingPhotoFailedToast, queuePendingMyPhoto } from '@features/profile-photos';
import { emitPushUnsubscribeForLogout, InstallSheet, PwaCallBridge, PwaOnboardingCard, UpdateToast, useNotificationMirror, usePwaChatShell } from '@features/pwa';
import { NewChatModal, Sidebar, useMutedRooms, useRooms } from '@features/rooms';
import { useChatSettingsSync, useTheme, useThemeSync, withAlpha } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useSplashPresence } from '@hooks/useSplashPresence';
import { useSustainedFlag } from '@hooks/useSustainedFlag';
import { useViewportHeight } from '@hooks/useViewportHeight';
import { translateErrorPayload } from '@lib/api/api-error';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { clearTranslationsForRoom } from '@lib/translation';
import { SocketProvider, useSocket, type AppSocket, type RoomSummary, type SocketErrorPayload } from '@lib/socket';
import { AppBackground } from './AppBackground';
import { DeepLinkConfirmDialog } from './DeepLinkConfirmDialog';
import { hasDeepLinkParams, readDeepLinkIntents, withInviteIntent, withoutFirstIntent, type DeepLinkIntent } from './deep-link';
import { discardPendingInvite, subscribeInviteFragment, takePendingInvite } from './invite-fragment';

const DEEP_LINK_ERROR_WINDOW_MS = 10000;
const CONNECTION_PROBLEM_DELAY_MS = 10000;
const PREFERENCES_RESET_DELAY_MS = 350;

interface RecoveryFilePrompt {
  userId: string;
  nickname: string;
  recoveryFile: string;
}

function restoreIdentityForCredential(socket: AppSocket, userId: string, credential: PendingE2eCredential | null): Promise<void> {
  switch (credential?.type) {
    case 'password-v2':
      return ensureIdentityAfterPasswordLoginV2(socket, userId, credential.wrapKey).finally(() => credential.wrapKey.fill(0));
    case 'recovery-v2':
      return ensureIdentityAfterRecoveryLogin(socket, userId, credential.recoveryWrapKey).finally(() => credential.recoveryWrapKey.fill(0));
    default:
      return hydrateCurrentIdentity(userId);
  }
}

function toRecoveryFilePrompt(userId: string, nickname: string) {
  return (recoveryFile: string | null): RecoveryFilePrompt | null => (recoveryFile ? { userId, nickname, recoveryFile } : null);
}

export function App() {
  const { user, isRestoring, login, logout, updateUser, consumePendingE2eCredential } = useAuthSession();
  const { resetUserPreferences } = useTheme();
  const handleLogout = useCallback(() => {
    logout();
    window.setTimeout(resetUserPreferences, PREFERENCES_RESET_DELAY_MS);
  }, [logout, resetUserPreferences]);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);

  useViewportHeight();

  return (
    <SocketProvider enabled={user !== null || pendingRegistration !== null}>
      <AuthGate
        user={user}
        isRestoring={isRestoring}
        pendingRegistration={pendingRegistration}
        onRegisterStart={setPendingRegistration}
        onLogin={login}
        onLogout={handleLogout}
        onUserUpdate={updateUser}
        consumePendingE2eCredential={consumePendingE2eCredential}
      />
    </SocketProvider>
  );
}

interface AuthGateProps {
  user: User | null;
  isRestoring: boolean;
  pendingRegistration: PendingRegistration | null;
  onRegisterStart: (input: PendingRegistration | null) => void;
  onLogin: (user: User, e2eCredential?: PendingE2eCredential) => void;
  onLogout: () => void;
  onUserUpdate: (patch: Partial<User>) => void;
  consumePendingE2eCredential: () => PendingE2eCredential | null;
}

function AuthGate({
  user,
  isRestoring,
  pendingRegistration,
  onRegisterStart,
  onLogin,
  onLogout,
  onUserUpdate,
  consumePendingE2eCredential,
}: AuthGateProps) {
  const { theme } = useTheme();
  const loginTheme = useLoginTheme();
  const { socket } = useSocket();
  const [recoveryFilePrompt, setRecoveryFilePrompt] = useState<RecoveryFilePrompt | null>(null);
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [registerError, setRegisterError] = useState('');

  useEffect(() => {
    if (user) {
      return;
    }
    window.addEventListener('pagehide', discardPendingInvite);
    return () => window.removeEventListener('pagehide', discardPendingInvite);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIsSocketReady(false);
    }
  }, [user]);

  useSocketAuthSync({
    user,
    pendingRegistration,
    onRegistered: ({ user: registered, sessionToken, authMethod }, registration) => {
      onLogin({
        id: registered.id,
        nickname: registered.nickname,
        avatar: registered.avatar,
        sessionToken,
        authMethod,
        status: registered.status,
        statusText: registered.statusText,
        theme: registered.theme,
        chatSettings: registered.chatSettings,
      });
      setIsSocketReady(true);
      setRegisterError('');

      if (registration && socket) {
        const { credentials } = registration;
        rememberAuthParams(registered.id, { version: 2, salt: credentials.authSalt });
        void completeRegistration(socket, registered.id, registered.nickname, credentials)
          .then(toRecoveryFilePrompt(registered.id, registered.nickname))
          .then((prompt) => {
            if (prompt) {
              setRecoveryFilePrompt(prompt);
            }
          })
          .catch((error: unknown) => console.error('[e2e] registration setup failed', error));
      }
      if (registration?.photo) {
        queuePendingMyPhoto(registration.photo);
      }
      onRegisterStart(null);
    },
    onResumed: ({ user: resumed, authMethod }) => {
      onUserUpdate({
        nickname: resumed.nickname,
        avatar: resumed.avatar,
        authMethod,
        status: resumed.status,
        statusText: resumed.statusText,
        theme: resumed.theme,
        chatSettings: resumed.chatSettings,
      });

      if (!socket) {
        setIsSocketReady(true);
        return;
      }

      const credential = consumePendingE2eCredential();
      const restoreIdentity = restoreIdentityForCredential(socket, resumed.id, credential);

      void restoreIdentity.finally(() => setIsSocketReady(true));
    },
    onResumeFailed: onLogout,
    onSessionRevoked: onLogout,
    onRegisterFailed: (message) => {
      setRegisterError(message);
      onRegisterStart(null);
    },
  });
  const currentUserId = user?.id;
  useEffect(() => {
    if (!socket || !currentUserId) {
      return;
    }
    const handleProfileUpdated = (payload: { userId: string; nickname: string; avatar: number; statusText: string | null }) => {
      if (payload.userId === currentUserId) {
        onUserUpdate({ nickname: payload.nickname, avatar: payload.avatar, statusText: payload.statusText });
      }
    };
    socket.on('user:profile-updated', handleProfileUpdated);
    return () => {
      socket.off('user:profile-updated', handleProfileUpdated);
    };
  }, [socket, currentUserId, onUserUpdate]);

  const { language } = useAppLanguage();
  useEffect(() => {
    if (socket && currentUserId) {
      socket.emit('user:set-locale', { locale: language });
    }
  }, [socket, currentUserId, language]);

  useThemeSync();
  useChatSettingsSync();

  const splash = useSplashPresence(isRestoring || (user !== null && !isSocketReady));

  const currentSessionToken = user?.sessionToken;
  const handleUserLogout = useCallback(() => {
    if (currentUserId && currentSessionToken) {
      void revokeServerSession({ userId: currentUserId, sessionToken: currentSessionToken });
    }
    emitPushUnsubscribeForLogout(socket);
    socket?.emit('user:logout');
    onLogout();
  }, [socket, onLogout, currentUserId, currentSessionToken]);

  return (
    <AppBackground theme={user ? theme : loginTheme.theme}>
      {isRestoring ? null : !user ? (
        <LoginScreen
          loginTheme={loginTheme}
          onRegister={onRegisterStart}
          onLogin={onLogin}
          registerError={registerError}
          entranceReady={!splash.mounted || splash.leaving}
        />
      ) : !isSocketReady ? null : (
        <ChatShell user={user} onUserUpdate={onUserUpdate} onLogout={handleUserLogout} />
      )}
      <RecoveryFileDownloadDialog
        isOpen={recoveryFilePrompt !== null}
        userId={recoveryFilePrompt?.userId ?? ''}
        nickname={recoveryFilePrompt?.nickname ?? ''}
        recoveryFile={recoveryFilePrompt?.recoveryFile ?? ''}
        onClose={() => setRecoveryFilePrompt(null)}
        isFirstDownload
      />
      <InstallSheet />
      <UpdateToast />
      <KeyTransparencyBanner />
      <PendingPhotoFailedToast />
      {splash.mounted && <LoadingScreen theme={theme} leaving={splash.leaving} />}
    </AppBackground>
  );
}

interface ChatShellProps {
  user: User;
  onUserUpdate: (patch: Partial<User>) => void;
  onLogout: () => void;
}

function lastRoomStorageKey(userId: string): string {
  return `sparkchat:last-room:${userId}`;
}

function ChatShell({ user, onUserUpdate, onLogout }: ChatShellProps) {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const connectionLost = useSustainedFlag(!connected, CONNECTION_PROBLEM_DELAY_MS);
  const { theme } = useTheme();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(lastRoomStorageKey(user.id));
    } catch {
      return null;
    }
  });
  const isWideLayout = useMediaQuery(minWidthQuery(SPLIT_LAYOUT_MIN_WIDTH_PX));
  const [isInfoColumnOpen, setIsInfoColumnOpen] = useState(false);
  const isSidebarCollapsed = isWideLayout && isInfoColumnOpen;
  const { rooms, isLoaded, typingUserIds, recordingUserIds } = useRooms(selectedRoomId, user.id);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

  const [deepLinkIntents, setDeepLinkIntents] = useState<DeepLinkIntent[]>(() =>
    readDeepLinkIntents(window.location.search, user.nickname),
  );
  const stopDeepLinkErrorWatchRef = useRef<(() => void) | null>(null);

  const notificationPreference = useNotificationPreference();
  const notificationContentPreference = useNotificationContentPreference();
  const soundPreference = useSoundPreference();
  const { mutedRoomIds, toggleMuted } = useMutedRooms(user.id);
  useAudioContextPrimer();
  const totalUnread = rooms.reduce((sum, room) => (mutedRoomIds.has(room.id) ? sum : sum + room.unreadCount), 0);

  useMessageNotifications(
    rooms,
    user.id,
    selectedRoomId,
    mutedRoomIds,
    notificationPreference.isEnabled,
    soundPreference.isEnabled,
    setSelectedRoomId,
    notificationContentPreference.isContentHidden,
  );
  useUnreadBadge(totalUnread);
  useChatTriggerEffects(selectedRoomId, user.id, soundPreference.isEnabled);
  useEnsureAssistantChat(rooms, isLoaded);

  const handleSelectRoom = useCallback((room: RoomSummary) => setSelectedRoomId(room.id), []);
  const { language: appLanguage } = useAppLanguage();
  const openNewChat = useCallback(() => setIsNewChatOpen(true), []);
  usePwaChatShell({ socket, connected, selectedRoomId, language: appLanguage, onOpenRoom: setSelectedRoomId, onNewChat: openNewChat });
  useNotificationMirror({ userId: user.id, rooms, hideContent: notificationContentPreference.isContentHidden, language: appLanguage });

  useEffect(() => {
    try {
      if (selectedRoomId) {
        localStorage.setItem(lastRoomStorageKey(user.id), selectedRoomId);
      } else {
        localStorage.removeItem(lastRoomStorageKey(user.id));
      }
    } catch (error) {
      console.error(error);
    }
  }, [selectedRoomId, user.id]);

  const enableNotificationPreference = notificationPreference.enable;
  const handleNotificationsGranted = useCallback(() => {
    void enableNotificationPreference();
  }, [enableNotificationPreference]);

  const handleToggleNotifications = () => {
    if (notificationPreference.isEnabled) {
      notificationPreference.disable();
    } else {
      void notificationPreference.enable();
    }
  };

  const handleDeleteRooms = (roomIds: string[]) => {
    const assistantRoomId = rooms.find(isAssistantRoom)?.id;
    const deletableRoomIds = roomIds.filter((roomId) => roomId !== assistantRoomId);
    deletableRoomIds.forEach((roomId) => {
      socket?.emit('room:delete', { roomId });
      clearTranslationsForRoom(roomId);
    });
    if (selectedRoomId && deletableRoomIds.includes(selectedRoomId)) {
      setSelectedRoomId(null);
    }
  };

  useEffect(() => {
    if (hasDeepLinkParams(window.location.search)) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => () => stopDeepLinkErrorWatchRef.current?.(), []);

  useEffect(() => {
    const consumeInviteFragment = () => {
      const target = takePendingInvite();
      if (!target) {
        return;
      }
      if (target === 'invalid') {
        window.alert(t('app.deepLink.invalidInvite'));
        return;
      }
      const invite = { kind: 'invite' as const, roomId: target.roomId, secret: target.secret };
      setDeepLinkIntents((previous) => withInviteIntent(previous, invite));
    };
    consumeInviteFragment();
    const unsubscribe = subscribeInviteFragment(consumeInviteFragment);
    return () => {
      unsubscribe();
    };
  }, [t]);

  const dismissDeepLink = useCallback(() => setDeepLinkIntents(withoutFirstIntent), []);

  const confirmDeepLink = useCallback(
    (intent: DeepLinkIntent) => {
      if (!socket) {
        return;
      }

      stopDeepLinkErrorWatchRef.current?.();
      const handleDeepLinkError = (payload: SocketErrorPayload) => {
        if (!payload.clientTempId && !payload.event) {
          window.alert(translateErrorPayload(payload, 'errors.generic'));
        }
      };
      const stopListening = () => {
        window.clearTimeout(timer);
        socket.off('error', handleDeepLinkError);
        socket.off('room:joined', stopListening);
        socket.off('room:created', stopListening);
        if (stopDeepLinkErrorWatchRef.current === stopListening) {
          stopDeepLinkErrorWatchRef.current = null;
        }
      };
      socket.on('error', handleDeepLinkError);
      socket.on('room:joined', stopListening);
      socket.on('room:created', stopListening);
      const timer = window.setTimeout(stopListening, DEEP_LINK_ERROR_WINDOW_MS);
      stopDeepLinkErrorWatchRef.current = stopListening;

      if (intent.kind === 'chat') {
        socket.emit('room:create-private', { targetNickname: intent.nickname });
      } else {
        const secret = intent.secret.slice();
        void prepareInviteJoin(intent.roomId, secret).then((request) => {
          secret.fill(0);
          if (!request) {
            stopListening();
            window.alert(t('app.deepLink.inviteUnavailable'));
            return;
          }
          void attestGroupAction(request.roomId, 'group.memberJoined').then((attestation) => {
            socket.emit('room:join-by-invite', attestation ? { ...request, attestation } : request);
          });
        });
      }
      dismissDeepLink();
    },
    [socket, dismissDeepLink, t],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }

    const openRoom = ({ room }: { room: RoomSummary }) => {
      if (isAssistantRoom(room)) {
        return;
      }
      setSelectedRoomId(room.id);
    };

    socket.on('room:joined', openRoom);
    socket.on('room:created', openRoom);

    return () => {
      socket.off('room:joined', openRoom);
      socket.off('room:created', openRoom);
    };
  }, [socket]);

  if (!isLoaded) {
    return (
    <Container fluid className="chat-shell-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center sc-anim-fade-in">
          <div
            className="loading-spinner"
            style={{
              width: '60px',
              height: '60px',
              margin: '0 auto 20px',
              border: `4px solid ${withAlpha(theme.onGradient, 0.3)}`,
              borderTop: `4px solid ${theme.onGradient}`,
              borderRadius: '50%',
            }}
          />
          <p className="sc-anim-pulse-soft" style={{ color: theme.onGradient, fontSize: '1rem' }}>
            {t('app.loadingConversations')}
          </p>
        </div>
      </Container>
    );
  }

  return (
    <CallProvider rooms={rooms}>
    <PwaCallBridge />
    <Container fluid className="chat-shell-container" style={{ padding: 0 }}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {connectionLost && (
          <div
            role="status"
            className="chat-connection-banner sc-anim-drop-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '8px 16px',
              borderRadius: '12px',
              background: theme.surfaceElevated,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadowSm,
              fontSize: '0.85rem',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            <LuWifiOff size={15} color={theme.warningText} aria-hidden="true" style={{ flexShrink: 0 }} />
            {t('app.connectionProblem')}
          </div>
        )}
        <Card className="chat-shell-card" style={{ flex: 1, minHeight: 0, border: 'none', overflow: 'hidden', background: theme.canvas, boxShadow: theme.shadowLg }}>
          <Row style={{ height: '100%', margin: 0 }}>
            <Col
              lg={4}
              md={5}
              xs={12}
              style={{
                padding: 0,
                height: '100%',
                display: !selectedRoom || isWideLayout ? 'block' : 'none',
                ...(isWideLayout
                  ? {
                      minWidth: isSidebarCollapsed ? 0 : '360px',
                      ...(isSidebarCollapsed ? { width: 0, flexBasis: 0, maxWidth: 0, opacity: 0, pointerEvents: 'none' as const } : {}),
                      overflow: 'hidden',
                      transition: 'width 420ms var(--sc-ease-spring-soft), min-width 420ms var(--sc-ease-spring-soft), max-width 420ms var(--sc-ease-spring-soft), flex-basis 420ms var(--sc-ease-spring-soft), opacity 260ms ease',
                    }
                  : { flex: '0 0 100%', maxWidth: '100%' }),
              }}
              aria-hidden={isSidebarCollapsed || undefined}
              inert={isSidebarCollapsed || undefined}
            >
              <Sidebar
                user={user}
                onUserUpdate={onUserUpdate}
                rooms={rooms}
                selectedRoomId={selectedRoomId}
                onSelectRoom={handleSelectRoom}
                onNewChat={() => setIsNewChatOpen(true)}
                onLogout={onLogout}
                onDeleteRooms={handleDeleteRooms}
                typingUserIds={typingUserIds}
                recordingUserIds={recordingUserIds}
                notificationsSupported={notificationPreference.isSupported}
                notificationsEnabled={notificationPreference.isEnabled}
                notificationsBlocked={notificationPreference.permission === 'denied'}
                onToggleNotifications={handleToggleNotifications}
                soundEnabled={soundPreference.isEnabled}
                onToggleSound={soundPreference.toggle}
                notificationContentHidden={notificationContentPreference.isContentHidden}
                onToggleNotificationContent={notificationContentPreference.toggle}
                mutedRoomIds={mutedRoomIds}
                onToggleMuted={toggleMuted}
                listHeader={<PwaOnboardingCard onNotificationsGranted={handleNotificationsGranted} />}
              />
            </Col>
            <Col
              lg={8}
              md={7}
              xs={12}
              style={{
                padding: 0,
                height: '100%',
                display: selectedRoom || isWideLayout ? 'block' : 'none',
                ...(isWideLayout ? { flex: '1 1 0', minWidth: 0, width: 'auto', maxWidth: 'none' } : { flex: '0 0 100%', maxWidth: '100%' }),
              }}
            >
              <ChatArea room={selectedRoom} rooms={rooms} user={user} onBack={() => setSelectedRoomId(null)} onInfoColumnChange={setIsInfoColumnOpen} />
            </Col>
          </Row>
        </Card>
      </div>
      <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} rooms={rooms} currentUserId={user.id} />
      <DeepLinkConfirmDialog
        intent={deepLinkIntents[0] ?? null}
        canConfirm={socket !== null}
        onConfirm={confirmDeepLink}
        onCancel={dismissDeepLink}
      />
    </Container>
    </CallProvider>
  );
}
