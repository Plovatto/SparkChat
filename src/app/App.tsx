import { useCallback, useEffect, useState } from 'react';
import { Card, Col, Container, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { LoadingScreen } from '@components/common/LoadingScreen';
import { RecoveryFileDownloadDialog } from '@components/common/RecoveryFileDownloadDialog';
import { Spinner } from '@components/common/Spinner';
import { minWidthQuery, SPLIT_LAYOUT_MIN_WIDTH_PX } from '@constants/breakpoints';
import {
  ChatArea,
  isAssistantRoom,
  useChatTriggerEffects,
  useEnsureAssistantChat,
} from '@features/chat';
import { LoginScreen, useAuthSession, useLoginTheme, useSocketAuthSync } from '@features/auth';
import type { PendingE2eCredential, PendingRegistration, User } from '@features/auth';
import {
  ensureIdentityAfterKeyfileLogin,
  ensureIdentityAfterPasswordLogin,
  hydrateCurrentIdentity,
  setupIdentityAfterRegister,
} from '@lib/e2ee';
import {
  useAudioContextPrimer,
  useMessageNotifications,
  useNotificationPreference,
  useSoundPreference,
  useUnreadBadge,
} from '@features/notifications';
import { NewChatModal, Sidebar, useMutedRooms, useRooms } from '@features/rooms';
import { useChatSettingsSync, useTheme, useThemeSync, withAlpha } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useViewportHeight } from '@hooks/useViewportHeight';
import { translateErrorPayload } from '@lib/api/api-error';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { clearTranslationsForRoom } from '@lib/translation';
import { SocketProvider, useSocket, type RoomSummary, type SocketErrorPayload } from '@lib/socket';
import { AppBackground } from './AppBackground';

const DEEP_LINK_ERROR_WINDOW_MS = 10000;
const PREFERENCES_RESET_DELAY_MS = 350;

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
  const [recoveryFilePrompt, setRecoveryFilePrompt] = useState<{ userId: string; nickname: string; recoveryFile: string } | null>(null);
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [registerError, setRegisterError] = useState('');

  useEffect(() => {
    if (!user) {
      setIsSocketReady(false);
    }
  }, [user]);

  useSocketAuthSync({
    user,
    pendingRegistration,
    onRegistered: ({ user: registered, sessionToken, recoveryFile, recoveryToken, authMethod }) => {
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
      setRecoveryFilePrompt({ userId: registered.id, nickname: registered.nickname, recoveryFile });
      setIsSocketReady(true);
      setRegisterError('');

      if (socket && pendingRegistration) {
        void setupIdentityAfterRegister(socket, registered.id, pendingRegistration.password, recoveryToken);
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
      const restoreIdentity =
        credential?.type === 'password'
          ? ensureIdentityAfterPasswordLogin(socket, resumed.id, credential.password)
          : credential?.type === 'keyfile'
            ? ensureIdentityAfterKeyfileLogin(socket, resumed.id, credential.recoveryToken)
            : hydrateCurrentIdentity(resumed.id);

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

  const handleUserLogout = useCallback(() => {
    socket?.emit('user:logout');
    onLogout();
  }, [socket, onLogout]);

  if (isRestoring) {
    return <LoadingScreen theme={theme} />;
  }

  return (
    <AppBackground theme={user ? theme : loginTheme.theme}>
      {!user ? (
        <LoginScreen loginTheme={loginTheme} onRegister={onRegisterStart} onLogin={onLogin} registerError={registerError} />
      ) : !isSocketReady ? (
        <LoadingScreen theme={theme} />
      ) : (
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
  const { theme } = useTheme();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(lastRoomStorageKey(user.id));
    } catch {
      return null;
    }
  });
  const isWideLayout = useMediaQuery(minWidthQuery(SPLIT_LAYOUT_MIN_WIDTH_PX));
  const { rooms, isLoaded, typingUserIds, recordingUserIds } = useRooms(selectedRoomId, user.id);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

  const notificationPreference = useNotificationPreference();
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
  );
  useUnreadBadge(totalUnread);
  useChatTriggerEffects(selectedRoomId, user.id, soundPreference.isEnabled);
  useEnsureAssistantChat(rooms, isLoaded);

  const handleSelectRoom = useCallback((room: RoomSummary) => setSelectedRoomId(room.id), []);

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
    if (!socket) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const startChatWith = params.get('startChat');
    const joinCode = params.get('join');

    const wantsChat = Boolean(startChatWith) && startChatWith?.toLowerCase() !== user.nickname.toLowerCase();
    if (!wantsChat && !joinCode) {
      if (startChatWith) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      return;
    }

    const handleDeepLinkError = (payload: SocketErrorPayload) => {
      if (!payload.clientTempId && !payload.event) {
        window.alert(translateErrorPayload(payload, 'errors.generic'));
      }
    };
    const stopListening = () => socket.off('error', handleDeepLinkError);
    socket.on('error', handleDeepLinkError);
    socket.on('room:joined', stopListening);
    socket.on('room:created', stopListening);
    const timer = window.setTimeout(stopListening, DEEP_LINK_ERROR_WINDOW_MS);

    if (wantsChat && startChatWith) {
      socket.emit('room:create-private', { targetNickname: startChatWith });
    }
    if (joinCode) {
      socket.emit('room:join-by-code', { roomCode: joinCode.toUpperCase() });
    }
    window.history.replaceState({}, '', window.location.pathname);

    return () => {
      window.clearTimeout(timer);
      stopListening();
      socket.off('room:joined', stopListening);
      socket.off('room:created', stopListening);
    };
  }, [socket, user.nickname]);

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
    <Container fluid className="chat-shell-container" style={{ padding: 0 }}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!connected && (
          <div
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
            <Spinner size={14} />
            {t('app.connecting')}
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
                ...(isWideLayout ? { minWidth: '360px' } : { flex: '0 0 100%', maxWidth: '100%' }),
              }}
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
                mutedRoomIds={mutedRoomIds}
                onToggleMuted={toggleMuted}
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
              <ChatArea room={selectedRoom} rooms={rooms} user={user} onBack={() => setSelectedRoomId(null)} />
            </Col>
          </Row>
        </Card>
      </div>
      <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
    </Container>
  );
}
