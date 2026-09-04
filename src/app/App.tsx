import { useEffect, useState } from 'react';
import { Card, Col, Container, Row } from 'react-bootstrap';
import { LoadingScreen } from '@components/common/LoadingScreen';
import { RecoveryFileDownloadDialog } from '@components/common/RecoveryFileDownloadDialog';
import { Spinner } from '@components/common/Spinner';
import { ChatArea, useChatTriggerEffects, useEnsureAssistantChat } from '@features/chat';
import { LoginScreen, useAuthSession, useSocketAuthSync } from '@features/auth';
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
import { useTheme, useThemeSync } from '@features/theme';
import { SocketProvider, useSocket } from '@lib/socket';
import { AppBackground } from './AppBackground';

export function App() {
  const { user, isRestoring, login, logout, updateUser, consumePendingE2eCredential } = useAuthSession();
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);

  return (
    <SocketProvider enabled={user !== null || pendingRegistration !== null}>
      <AuthGate
        user={user}
        isRestoring={isRestoring}
        pendingRegistration={pendingRegistration}
        onRegisterStart={setPendingRegistration}
        onLogin={login}
        onLogout={logout}
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
      });
      setRecoveryFilePrompt({ userId: registered.id, nickname: registered.nickname, recoveryFile });
      setIsSocketReady(true);

      if (socket && pendingRegistration) {
        void setupIdentityAfterRegister(socket, registered.id, pendingRegistration.password, recoveryToken);
      }
    },
    onResumed: ({ user: resumed, authMethod }) => {
      onUserUpdate({
        nickname: resumed.nickname,
        avatar: resumed.avatar,
        authMethod,
        status: resumed.status,
        statusText: resumed.statusText,
        theme: resumed.theme,
      });
      setIsSocketReady(true);

      if (socket) {
        const credential = consumePendingE2eCredential();
        if (credential?.type === 'password') {
          void ensureIdentityAfterPasswordLogin(socket, resumed.id, credential.password);
        } else if (credential?.type === 'keyfile') {
          void ensureIdentityAfterKeyfileLogin(socket, resumed.id, credential.recoveryToken);
        } else {
          void hydrateCurrentIdentity(resumed.id);
        }
      }
    },
    onResumeFailed: onLogout,
    onRegisterFailed: (message) => {
      setRegisterError(message);
      onRegisterStart(null);
    },
  });
  useThemeSync(user);

  if (isRestoring) {
    return <LoadingScreen />;
  }

  return (
    <AppBackground>
      {!user ? (
        <LoginScreen onRegister={onRegisterStart} onLogin={onLogin} registerError={registerError} />
      ) : !isSocketReady ? (
        <LoadingScreen />
      ) : (
        <ChatShell user={user} onUserUpdate={onUserUpdate} onLogout={onLogout} />
      )}
      <RecoveryFileDownloadDialog
        isOpen={recoveryFilePrompt !== null}
        userId={recoveryFilePrompt?.userId ?? ''}
        nickname={recoveryFilePrompt?.nickname ?? ''}
        recoveryFile={recoveryFilePrompt?.recoveryFile ?? ''}
        onClose={() => setRecoveryFilePrompt(null)}
        theme={theme}
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

function ChatShell({ user, onUserUpdate, onLogout }: ChatShellProps) {
  const { socket, connected } = useSocket();
  const { theme } = useTheme();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const { rooms, isLoaded, typingUserIds, recordingUserIds } = useRooms(selectedRoomId, user.id);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

  const notificationPreference = useNotificationPreference();
  const soundPreference = useSoundPreference();
  const { mutedRoomIds, toggleMuted } = useMutedRooms();
  useAudioContextPrimer();
  const totalUnread = rooms.reduce((sum, room) => sum + room.unreadCount, 0);

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

  const handleToggleNotifications = () => {
    if (notificationPreference.isEnabled) {
      notificationPreference.disable();
    } else {
      void notificationPreference.enable();
    }
  };

  const handleDeleteRooms = (roomIds: string[]) => {
    roomIds.forEach((roomId) => socket?.emit('room:delete', { roomId }));
    if (selectedRoomId && roomIds.includes(selectedRoomId)) {
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

    if (startChatWith && startChatWith !== user.nickname) {
      socket.emit('room:create-private', { targetNickname: startChatWith });
    }

    if (joinCode) {
      socket.emit('room:join-by-code', { roomCode: joinCode.toUpperCase() });
    }

    if (startChatWith || joinCode) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [socket, user.nickname]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const openRoom = ({ room }: { room: { id: string } }) => setSelectedRoomId(room.id);

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
        <div className="text-center">
          <div className="loading-spinner" style={{ width: '60px', height: '60px', margin: '0 auto 20px', border: '4px solid rgba(166, 166, 166, 0.3)', borderTop: '4px solid #ffffff', borderRadius: '50%' }} />
          <p style={{ color: '#ffffff', fontSize: '1rem' }}>Carregando conversas...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container fluid className="chat-shell-container" style={{ padding: 0 }}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!connected && (
          <div
            className="animate__animated animate__fadeInDown animate__faster"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '8px 16px',
              borderRadius: '12px',
              background: theme.surface,
              color: theme.textSecondary,
              fontSize: '0.85rem',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            <Spinner size={14} />
            Conectando ao servidor...
          </div>
        )}
        <Card className="chat-shell-card" style={{ flex: 1, minHeight: 0, border: 'none', overflow: 'hidden' }}>
          <Row style={{ height: '100%', margin: 0 }}>
            <Col lg={4} md={5} xs={12} style={{ padding: 0, height: '100%' }} className={selectedRoom ? 'd-none d-md-block' : undefined}>
              <Sidebar
                user={user}
                onUserUpdate={onUserUpdate}
                rooms={rooms}
                selectedRoomId={selectedRoomId}
                onSelectRoom={(room) => setSelectedRoomId(room.id)}
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
              style={{ padding: 0, height: '100%' }}
              className={selectedRoom ? 'd-block' : 'd-none d-md-block'}
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
