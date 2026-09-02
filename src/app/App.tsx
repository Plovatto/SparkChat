import { useEffect, useState } from 'react';
import { Card, Col, Container, Row } from 'react-bootstrap';
import { LoadingScreen } from '@components/common/LoadingScreen';
import { Spinner } from '@components/common/Spinner';
import { ChatArea, useChatTriggerEffects } from '@features/chat';
import { LoginScreen, useAuthSession, useSocketAuthSync } from '@features/auth';
import type { User } from '@features/auth';
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
  const { user, isRestoring, login, logout, updateUser } = useAuthSession();

  return (
    <SocketProvider enabled={user !== null}>
      <AuthGate user={user} isRestoring={isRestoring} onLogin={login} onLogout={logout} onUserUpdate={updateUser} />
    </SocketProvider>
  );
}

interface AuthGateProps {
  user: User | null;
  isRestoring: boolean;
  onLogin: (user: User) => void;
  onLogout: () => void;
  onUserUpdate: (patch: Partial<User>) => void;
}

function AuthGate({ user, isRestoring, onLogin, onLogout, onUserUpdate }: AuthGateProps) {
  useSocketAuthSync({
    user,
    onRegistered: onUserUpdate,
    onError: (message) => console.error(message),
  });
  useThemeSync(user);

  if (isRestoring) {
    return <LoadingScreen />;
  }

  return (
    <AppBackground>
      {!user ? <LoginScreen onAuthenticated={onLogin} /> : <ChatShell user={user} onLogout={onLogout} />}
    </AppBackground>
  );
}

interface ChatShellProps {
  user: User;
  onLogout: () => void;
}

function ChatShell({ user, onLogout }: ChatShellProps) {
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
              <ChatArea room={selectedRoom} user={user} onBack={() => setSelectedRoomId(null)} />
            </Col>
          </Row>
        </Card>
      </div>
      <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
    </Container>
  );
}
