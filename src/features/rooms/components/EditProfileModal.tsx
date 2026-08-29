import { useEffect, useState } from 'react';
import { FaCopy } from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { AVATARS } from '@features/auth/constants/avatars';
import type { User } from '@features/auth';
import { useSocket } from '@lib/socket';
import { useTheme } from '@features/theme';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

const NICKNAME_MAX_LENGTH = 20;

export function EditProfileModal({ isOpen, onClose, user }: EditProfileModalProps) {
  const { theme } = useTheme();
  const { socket } = useSocket();
  const [nickname, setNickname] = useState(user.nickname);
  const [avatar, setAvatar] = useState(user.avatar);
  const [loginCodeCopied, setLoginCodeCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNickname(user.nickname);
      setAvatar(user.avatar);
    }
  }, [isOpen, user.nickname, user.avatar]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleSuccess = () => onClose();
    socket.on('user:profile-updated-success', handleSuccess);

    return () => {
      socket.off('user:profile-updated-success', handleSuccess);
    };
  }, [socket, onClose]);

  const hasChanges = nickname !== user.nickname || avatar !== user.avatar;

  const copyLoginCode = () => {
    if (!user.loginCode || !navigator.clipboard) {
      return;
    }

    navigator.clipboard
      .writeText(user.loginCode)
      .then(() => {
        setLoginCodeCopied(true);
        setTimeout(() => setLoginCodeCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  const handleSave = () => {
    socket?.emit('user:update-profile', { nickname: nickname.trim(), avatar });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Perfil" theme={theme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px', color: theme.text, fontSize: '0.95rem' }}>
            Apelido
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder="Digite seu apelido"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: `1.5px solid ${theme.border}`,
              borderRadius: '10px',
              fontSize: '1rem',
              background: theme.background,
              color: theme.text,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = theme.primary;
              event.currentTarget.style.boxShadow = `0 0 0 3px ${theme.primary}1A`;
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = theme.border;
              event.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: '12px', color: theme.text, fontSize: '0.95rem' }}>
            Avatar
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
            {AVATARS.map((avatarOption, index) => {
              const isSelected = avatar === index;
              return (
                <button
                  key={avatarOption.name}
                  onClick={() => setAvatar(index)}
                  style={{
                    width: '100%',
                    padding: '16px',
                    background: isSelected ? avatarOption.bgGradient : theme.background,
                    border: `2px solid ${theme.border}`,
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                  }}
                  onMouseEnter={(event) => {
                    if (!isSelected) {
                      event.currentTarget.style.transform = 'scale(1.02)';
                    }
                  }}
                  onMouseLeave={(event) => {
                    if (!isSelected) {
                      event.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  <avatarOption.icon size={28} color={isSelected ? 'white' : theme.text} />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={{ fontWeight: 600, display: 'block', margin: '0 0 12px 2px', color: theme.text, fontSize: '0.95rem' }}>
            Código de Login
          </label>
          <div
            style={{
              background: theme.background,
              border: `1.5px solid ${theme.border}`,
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <code
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '1.1rem',
                fontWeight: 600,
                color: theme.text,
                userSelect: 'all',
                letterSpacing: '1px',
                margin: '0 0 0 8px',
              }}
            >
              {user.loginCode}
            </code>
            <button
              onClick={copyLoginCode}
              style={{
                backgroundImage: theme.headerGradient,
                border: 'none',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = `0 4px 12px ${theme.primary}4D`;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = 'none';
              }}
            >
              {loginCodeCopied ? '✓ Copiado' : <FaCopy size={18} style={{ display: 'inline' }} />}
            </button>
          </div>
          <small style={{ color: theme.textSecondary, margin: '6px 0 0 5px', display: 'block' }}>
            Use este código para fazer login
          </small>
        </div>

        {hasChanges && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 20px',
                borderRadius: '10px',
                border: `1.5px solid ${theme.border}`,
                background: theme.background,
                color: theme.text,
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                padding: '12px 20px',
                borderRadius: '10px',
                border: 'none',
                background: theme.headerGradient,
                color: 'white',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: `0 4px 12px ${theme.primary}4D`,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = `0 8px 20px ${theme.primary}66`;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = `0 4px 12px ${theme.primary}4D`;
              }}
            >
              Salvar Alterações
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
