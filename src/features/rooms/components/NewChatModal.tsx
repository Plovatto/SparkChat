import { useEffect, useState, type CSSProperties, type FocusEvent, type FormEvent } from 'react';
import { FaArrowRight, FaUser, FaUsers } from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { useSocket } from '@lib/socket';
import { DEFAULT_ROOM_THEME } from '../constants/default-theme';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChatType = 'private' | 'group';
type GroupMode = 'join' | 'create';

const theme = DEFAULT_ROOM_THEME;

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  border: `1.5px solid ${theme.border}`,
  borderRadius: '10px',
  fontSize: '1rem',
  background: theme.background,
  color: theme.text,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle: CSSProperties = {
  fontWeight: 600,
  display: 'block',
  marginBottom: '10px',
  color: theme.text,
  fontSize: '0.95rem',
};

const helperStyle: CSSProperties = {
  color: theme.textSecondary,
  marginTop: '6px',
  display: 'block',
};

const primaryButtonStyle: CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  borderRadius: '10px',
  border: 'none',
  background: theme.primary,
  color: 'white',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
};

const outlineButtonStyle: CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  borderRadius: '10px',
  border: `2px solid ${theme.primary}`,
  background: 'transparent',
  color: theme.primary,
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
};

function focusInput(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.style.borderColor = theme.primary;
  event.currentTarget.style.boxShadow = `0 0 0 3px ${theme.primary}1A`;
}

function blurInput(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.style.borderColor = theme.border;
  event.currentTarget.style.boxShadow = 'none';
}

function OrDivider() {
  return (
    <div style={{ textAlign: 'center', position: 'relative', margin: '8px 0' }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: theme.border }} />
      <span
        style={{
          background: theme.surface,
          padding: '0 15px',
          color: theme.textSecondary,
          fontSize: '0.85rem',
          fontWeight: 600,
          position: 'relative',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        OU
      </span>
    </div>
  );
}

export function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const { socket } = useSocket();
  const [chatType, setChatType] = useState<ChatType>('private');
  const [chatCode, setChatCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('join');

  useEffect(() => {
    if (!isOpen) {
      setChatType('private');
      setChatCode('');
      setRoomCode('');
      setGroupName('');
      setError('');
      setGroupMode('join');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleError = () => setError('Código inválido');
    const handleRoomCreated = () => onClose();
    const handleRoomJoined = () => onClose();

    socket.on('error', handleError);
    socket.on('room:created', handleRoomCreated);
    socket.on('room:joined', handleRoomJoined);

    return () => {
      socket.off('error', handleError);
      socket.off('room:created', handleRoomCreated);
      socket.off('room:joined', handleRoomJoined);
    };
  }, [socket, isOpen, onClose]);

  const handleStartPrivateChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (chatCode.trim().length < 6) {
      setError('Código de chat inválido');
      return;
    }
    socket?.emit('room:create-private', { targetChatCode: chatCode.toUpperCase() });
    setError('');
  };

  const handleJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (roomCode.trim().length < 6) {
      setError('Código de sala inválido');
      return;
    }
    socket?.emit('room:join-by-code', { roomCode: roomCode.toUpperCase() });
    setError('');
  };

  const handleCreateGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (groupName.trim().length < 3) {
      setError('Nome da sala deve ter pelo menos 3 caracteres');
      return;
    }
    socket?.emit('room:create-group', { roomName: groupName.trim() });
    setError('');
  };

  return (
    <Modal isOpen={isOpen} title="Novo Chat" onClose={onClose} theme={theme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', marginBottom: '16px', borderBottom: `2px solid ${theme.border}` }}>
          <button
            onClick={() => {
              setChatType('private');
              setError('');
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: chatType === 'private' ? theme.primary : theme.textSecondary,
              fontSize: '0.95rem',
              fontWeight: chatType === 'private' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderBottom: chatType === 'private' ? `3px solid ${theme.primary}` : `2px solid ${theme.border}`,
            }}
            onMouseEnter={(event) => {
              if (chatType !== 'private') event.currentTarget.style.color = theme.primary;
            }}
            onMouseLeave={(event) => {
              if (chatType !== 'private') event.currentTarget.style.color = theme.textSecondary;
            }}
          >
            <FaUser size={16} />
            Privado
          </button>
          <button
            onClick={() => {
              setChatType('group');
              setError('');
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: chatType === 'group' ? theme.primary : theme.textSecondary,
              fontSize: '0.95rem',
              fontWeight: chatType === 'group' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderBottom: chatType === 'group' ? `3px solid ${theme.primary}` : `2px solid ${theme.border}`,
            }}
            onMouseEnter={(event) => {
              if (chatType !== 'group') event.currentTarget.style.color = theme.primary;
            }}
            onMouseLeave={(event) => {
              if (chatType !== 'group') event.currentTarget.style.color = theme.textSecondary;
            }}
          >
            <FaUsers size={16} />
            Grupo
          </button>
        </div>

        {error && (
          <div
            className="animate__animated animate__shakeX"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '0.9rem',
              color: '#dc2626',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}
          >
            <span style={{ marginTop: '2px' }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {chatType === 'private' && (
          <form
            data-aos="fade-up"
            data-aos-duration="400"
            className="animate__animated animate__fadeIn"
            onSubmit={handleStartPrivateChat}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <label style={labelStyle}>Código de Chat do Amigo</label>
              <input
                type="text"
                value={chatCode}
                onChange={(event) => {
                  setChatCode(event.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="Ex: ABC123"
                maxLength={6}
                autoFocus
                style={inputStyle}
                onFocus={focusInput}
                onBlur={blurInput}
              />
              <small style={helperStyle}>Digite o código de chat do seu amigo para iniciar uma conversa</small>
            </div>
            <button
              type="submit"
              style={{ ...primaryButtonStyle, boxShadow: `0 4px 12px ${theme.primary}30` }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = `0 8px 20px ${theme.primary}40`;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = `0 4px 12px ${theme.primary}30`;
              }}
            >
              <FaArrowRight size={14} />
              Iniciar Chat
            </button>
          </form>
        )}

        {chatType === 'group' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              className={groupMode === 'join' ? 'animate__animated animate__slideInLeft animate__faster' : 'animate__animated animate__slideOutRight animate__faster'}
              style={{ display: groupMode === 'join' ? 'flex' : 'none', flexDirection: 'column', gap: '16px' }}
            >
              <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Entrar em Sala Existente</label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(event) => {
                      setRoomCode(event.target.value.toUpperCase());
                      setError('');
                    }}
                    placeholder="Código da sala"
                    maxLength={8}
                    autoFocus={groupMode === 'join'}
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <small style={helperStyle}>Digite o código da sala para entrar</small>
                </div>
                <button
                  type="submit"
                  style={{ ...primaryButtonStyle, boxShadow: `0 4px 12px ${theme.primary}30` }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = 'translateY(-2px)';
                    event.currentTarget.style.boxShadow = `0 8px 20px ${theme.primary}30`;
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = 'translateY(0)';
                    event.currentTarget.style.boxShadow = `0 4px 12px ${theme.primary}30`;
                  }}
                >
                  <FaArrowRight size={14} />
                  Entrar na Sala
                </button>
              </form>

              <OrDivider />

              <button
                onClick={() => {
                  setGroupMode('create');
                  setRoomCode('');
                  setError('');
                }}
                style={outlineButtonStyle}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = `${theme.primary}30`;
                  event.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                  event.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Criar Nova Sala
              </button>
            </div>

            <div
              className={groupMode === 'create' ? 'animate__animated animate__slideInRight animate__faster' : 'animate__animated animate__slideOutLeft animate__faster'}
              style={{ display: groupMode === 'create' ? 'flex' : 'none', flexDirection: 'column', gap: '16px' }}
            >
              <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Criar Nova Sala</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(event) => {
                      setGroupName(event.target.value);
                      setError('');
                    }}
                    placeholder="Nome da sala"
                    maxLength={30}
                    autoFocus={groupMode === 'create'}
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <small style={helperStyle}>Digite um nome para sua nova sala</small>
                </div>
                <button
                  type="submit"
                  style={primaryButtonStyle}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <FaArrowRight size={14} />
                  Criar Sala
                </button>
              </form>

              <OrDivider />

              <button
                onClick={() => {
                  setGroupMode('join');
                  setGroupName('');
                  setError('');
                }}
                style={outlineButtonStyle}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Entrar em Sala Existente
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
