import { Button, Card, Container } from 'react-bootstrap';
import { LoadingScreen } from '@components/common/LoadingScreen';
import { AVATARS } from '@features/auth/constants/avatars';
import { LoginScreen, useAuthSession, useSocketAuthSync } from '@features/auth';
import type { User } from '@features/auth';
import { SocketProvider } from '@lib/socket';
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
      {!user ? (
        <LoginScreen onAuthenticated={onLogin} />
      ) : (
        <AuthenticatedPlaceholder user={user} onLogout={onLogout} />
      )}
    </AppBackground>
  );
}

interface AuthenticatedPlaceholderProps {
  user: User;
  onLogout: () => void;
}

function AuthenticatedPlaceholder({ user, onLogout }: AuthenticatedPlaceholderProps) {
  return (
    <Container fluid className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <Card style={{ maxWidth: '420px', width: '100%', borderRadius: '24px' }} className="text-center p-4">
        <Card.Body>
          <AvatarBadge avatarIndex={user.avatar} />
          <h4 className="mb-1">Olá, {user.nickname}!</h4>
          <p className="text-muted mb-3">
            {user.chatCode ? (
              <>
                Seu código de chat: <strong>{user.chatCode}</strong>
              </>
            ) : (
              'Conectando...'
            )}
          </p>
          <p className="text-muted small mb-4">
            A área de conversas chega na próxima fase. Por enquanto, sua sessão já está autenticada e sincronizada
            com o servidor em tempo real.
          </p>
          <Button variant="outline-secondary" onClick={onLogout}>
            Sair
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
}

function AvatarBadge({ avatarIndex }: { avatarIndex: number }) {
  const avatar = AVATARS[avatarIndex];

  if (!avatar) {
    return null;
  }

  const Icon = avatar.icon;

  return (
    <div
      style={{
        width: '72px',
        height: '72px',
        borderRadius: '16px',
        margin: '0 auto 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: avatar.bgGradient,
      }}
    >
      <Icon size={36} color="white" />
    </div>
  );
}
