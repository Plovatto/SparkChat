import { useState } from 'react';
import { Card, Col, Container, Row } from 'react-bootstrap';
import { LoadingScreen } from '@components/common/LoadingScreen';
import { ChatArea } from '@features/chat';
import { LoginScreen, useAuthSession, useSocketAuthSync } from '@features/auth';
import type { User } from '@features/auth';
import { NewChatModal, Sidebar, useRooms } from '@features/rooms';
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
  const { socket } = useSocket();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const { rooms, isLoaded } = useRooms(selectedRoomId);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

  const handleDeleteRooms = (roomIds: string[]) => {
    roomIds.forEach((roomId) => socket?.emit('room:delete', { roomId }));
    if (selectedRoomId && roomIds.includes(selectedRoomId)) {
      setSelectedRoomId(null);
    }
  };

  if (!isLoaded) {
    return (
      <Container fluid style={{ maxWidth: '1400px', height: '90vh', maxHeight: '900px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <div className="loading-spinner" style={{ width: '60px', height: '60px', margin: '0 auto 20px', border: '4px solid rgba(166, 166, 166, 0.3)', borderTop: '4px solid #ffffff', borderRadius: '50%' }} />
          <p style={{ color: '#ffffff', fontSize: '1rem' }}>Carregando conversas...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container fluid style={{ maxWidth: '1400px', height: '90vh', maxHeight: '900px', padding: 0 }}>
      <div style={{ height: '100%' }}>
        <Card style={{ borderRadius: '20px', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)', height: '100%', border: 'none', overflow: 'hidden' }}>
          <Row style={{ height: '100%', margin: 0 }}>
            <Col lg={4} md={5} xs={12} style={{ padding: 0, height: '100%' }}>
              <Sidebar
                user={user}
                rooms={rooms}
                selectedRoomId={selectedRoomId}
                onSelectRoom={(room) => setSelectedRoomId(room.id)}
                onNewChat={() => setIsNewChatOpen(true)}
                onLogout={onLogout}
                onDeleteRooms={handleDeleteRooms}
              />
            </Col>
            <Col lg={8} md={7} xs={12} style={{ padding: 0, height: '100%' }} className="d-none d-md-block">
              <ChatArea room={selectedRoom} user={user} />
            </Col>
          </Row>
        </Card>
      </div>
      <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
    </Container>
  );
}
