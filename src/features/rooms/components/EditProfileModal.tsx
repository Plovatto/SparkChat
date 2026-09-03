import { useEffect, useRef, useState } from 'react';
import {
  FaCheck,
  FaDesktop,
  FaExclamationTriangle,
  FaFileDownload,
  FaKey,
  FaLock,
  FaPen,
  FaShareAlt,
  FaShieldAlt,
  FaSignOutAlt,
  FaUser,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { RecoveryFileDownloadDialog } from '@components/common/RecoveryFileDownloadDialog';
import { Switch } from '@components/common/Switch';
import { AVATARS } from '@features/auth/constants/avatars';
import { PasswordField, PasswordFieldHint } from '@features/auth/components/PasswordField';
import { useResponsiveAvatarSize } from '@features/auth/hooks/useResponsiveAvatarSize';
import { getPasswordMatchStatus } from '@features/auth/lib/password-match';
import type { User } from '@features/auth';
import { useSocket, type AuthMethod, type SessionSummary, type SocketUser } from '@lib/socket';
import { ensureAutoSavePermission, tryAutoOverwrite } from '@lib/recovery-file-storage';
import { useAutoDismiss } from '@lib/use-auto-dismiss';
import { useTheme } from '@features/theme';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUserUpdate: (patch: Partial<User>) => void;
  onLogout: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

type ProfileTab = 'profile' | 'security' | 'system';

const NICKNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 12;
const WRONG_PASSWORD_MESSAGE = 'Senha atual incorreta.';

const AUTH_METHOD_LABEL: Record<AuthMethod, string> = {
  password: 'Entrou com senha',
  keyfile: 'Entrou com arquivo de recuperação',
};

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function EditProfileModal({ isOpen, onClose, user, onUserUpdate, onLogout, soundEnabled, onToggleSound }: EditProfileModalProps) {
  const { theme } = useTheme();
  const { socket } = useSocket();
  const { avatarSize, iconSize } = useResponsiveAvatarSize();

  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [nickname, setNickname] = useState(user.nickname);
  const [avatar, setAvatar] = useState(user.avatar);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  useAutoDismiss(passwordError, setPasswordError);

  const [profileError, setProfileError] = useState('');
  useAutoDismiss(profileError, setProfileError);

  const [regenerateError, setRegenerateError] = useState('');
  useAutoDismiss(regenerateError, setRegenerateError);

  const [autoSaveFeedback, setAutoSaveFeedback] = useState('');
  useAutoDismiss(autoSaveFeedback, setAutoSaveFeedback);

  const [linkCopied, setLinkCopied] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [recoveryFilePrompt, setRecoveryFilePrompt] = useState<string | null>(null);
  const [pendingLogoutAfterDownload, setPendingLogoutAfterDownload] = useState(false);
  const pendingActionRef = useRef<'profile' | 'password' | 'regenerate' | null>(null);
  const isRevokingOwnSessionRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('profile');
      setNickname(user.nickname);
      setAvatar(user.avatar);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordError('');
      setProfileError('');
      setRegenerateError('');
      socket?.emit('user:list-sessions');
    }
  }, [isOpen, user.nickname, user.avatar, socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const trySilentRecoveryFileUpdate = async (recoveryFile: string, nicknameForFile: string): Promise<boolean> => {
      const filename = `sparkchat-${nicknameForFile.toLowerCase()}.sparkkey`;
      const saved = await tryAutoOverwrite(recoveryFile, filename, user.id);
      if (saved) {
        setAutoSaveFeedback('Arquivo de recuperação atualizado automaticamente.');
      }
      return saved;
    };

    const handleProfileUpdated = async ({ user: updated, recoveryFile }: { user: SocketUser; recoveryFile: string | null }) => {
      pendingActionRef.current = null;
      onUserUpdate({ nickname: updated.nickname, avatar: updated.avatar });
      if (!recoveryFile) {
        onClose();
        return;
      }
      if (await trySilentRecoveryFileUpdate(recoveryFile, updated.nickname)) {
        onClose();
        return;
      }
      setRecoveryFilePrompt(recoveryFile);
    };

    const handlePasswordChanged = async ({ recoveryFile }: { recoveryFile: string }) => {
      pendingActionRef.current = null;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      if (await trySilentRecoveryFileUpdate(recoveryFile, user.nickname)) {
        setTimeout(onLogout, 1600);
        return;
      }
      setPendingLogoutAfterDownload(true);
      setRecoveryFilePrompt(recoveryFile);
    };

    const handleRecoveryFileRegenerated = async ({ recoveryFile }: { recoveryFile: string }) => {
      pendingActionRef.current = null;
      if (await trySilentRecoveryFileUpdate(recoveryFile, user.nickname)) {
        return;
      }
      setRecoveryFilePrompt(recoveryFile);
    };

    const handleSessions = ({ sessions: list }: { sessions: SessionSummary[] }) => {
      setSessions(list);
      if (isRevokingOwnSessionRef.current && !list.some((session) => session.isCurrent)) {
        isRevokingOwnSessionRef.current = false;
        onLogout();
      }
    };

    const handleError = ({ message }: { message: string }) => {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action === 'password') {
        setPasswordError(message);
      } else if (action === 'regenerate') {
        setRegenerateError(message);
      } else if (action === 'profile') {
        setProfileError(message);
      }
    };

    socket.on('user:profile-updated-success', handleProfileUpdated);
    socket.on('user:password-changed', handlePasswordChanged);
    socket.on('user:recovery-file-regenerated', handleRecoveryFileRegenerated);
    socket.on('user:sessions', handleSessions);
    socket.on('error', handleError);

    return () => {
      socket.off('user:profile-updated-success', handleProfileUpdated);
      socket.off('user:password-changed', handlePasswordChanged);
      socket.off('user:recovery-file-regenerated', handleRecoveryFileRegenerated);
      socket.off('user:sessions', handleSessions);
      socket.off('error', handleError);
    };
  }, [socket, onUserUpdate, onClose, onLogout, user.id, user.nickname]);

  const hasChanges = nickname !== user.nickname || avatar !== user.avatar;

  const handleSaveProfile = () => {
    setProfileError('');
    pendingActionRef.current = 'profile';
    void ensureAutoSavePermission(user.id);
    socket?.emit('user:update-profile', { nickname: nickname.trim(), avatar });
  };

  const handleShare = () => {
    const link = `${window.location.origin}${window.location.pathname}?startChat=${encodeURIComponent(user.nickname)}`;

    if (navigator.share) {
      navigator.share({ title: 'SparkChat', text: `Fale comigo no SparkChat! Meu username é ${user.nickname}`, url: link }).catch(() => undefined);
      return;
    }

    if (!navigator.clipboard) {
      return;
    }

    navigator.clipboard
      .writeText(link)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  const handleChangePassword = () => {
    setPasswordError('');

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError(`A nova senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('As senhas não coincidem.');
      return;
    }

    pendingActionRef.current = 'password';
    void ensureAutoSavePermission(user.id);
    socket?.emit('user:change-password', {
      currentPassword: currentPassword || undefined,
      newPassword,
    });
  };

  const handleRegenerateRecoveryFile = () => {
    setRegenerateError('');
    pendingActionRef.current = 'regenerate';
    void ensureAutoSavePermission(user.id);
    socket?.emit('user:regenerate-recovery-file');
  };

  const handleRevokeSession = (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId);
    if (target?.isCurrent) {
      isRevokingOwnSessionRef.current = true;
    }
    socket?.emit('user:revoke-session', { sessionId });
  };

  const handleRecoveryDialogClose = () => {
    setRecoveryFilePrompt(null);
    if (pendingLogoutAfterDownload) {
      setPendingLogoutAfterDownload(false);
      onLogout();
      return;
    }
    onClose();
  };

  const inputStyle = {
    width: '100%',
    padding: '15px clamp(14px, 3vw, 22px)',
    paddingRight: '46px',
    border: `1.5px solid ${theme.border}`,
    borderRadius: '14px',
    fontSize: '0.95rem',
    background: theme.background,
    color: theme.text,
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const passwordFieldTheme = {
    inputBorder: theme.border,
    inputBg: theme.background,
    inputText: theme.text,
    textSecondary: theme.textSecondary,
  };

  const needsCurrentPassword = user.authMethod !== 'keyfile';
  const changePasswordDisabled = !newPassword || !confirmNewPassword || (needsCurrentPassword && !currentPassword);

  return (
    <Modal
      isOpen={isOpen}
      onClose={recoveryFilePrompt === null ? onClose : () => {}}
      showCloseButton={recoveryFilePrompt === null}
      title="Editar Perfil"
      theme={theme}
      maxWidth="600px"
    >
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, marginBottom: '20px' }}>
        {(
          [
            { id: 'profile' as const, label: 'Perfil', icon: FaUser },
            { id: 'security' as const, label: 'Segurança', icon: FaShieldAlt },
            { id: 'system' as const, label: 'Sistema', icon: FaDesktop },
          ]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: 'transparent',
              color: activeTab === id ? theme.primary : theme.textSecondary,
              fontSize: '0.9rem',
              fontWeight: activeTab === id ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderBottom: activeTab === id ? `3px solid ${theme.primary}` : '3px solid transparent',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {autoSaveFeedback && (
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            background: 'rgba(34, 197, 94, 0.12)',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '0.85rem',
            color: '#22c55e',
            fontWeight: 600,
            marginBottom: '20px',
          }}
        >
          <FaCheck size={13} style={{ flexShrink: 0 }} />
          <span>{autoSaveFeedback}</span>
        </div>
      )}

      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px', color: theme.text, fontSize: '0.95rem' }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={NICKNAME_MAX_LENGTH}
                  placeholder="Digite seu username"
                  className="smooth-transition"
                  style={inputStyle}
                  onFocus={(event) => {
                    event.currentTarget.style.borderColor = '#667eea';
                    event.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(event) => {
                    event.currentTarget.style.borderColor = theme.border;
                    event.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <FaPen
                  size={14}
                  color={theme.textSecondary}
                  style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
              </div>
            </div>

            <button
              onClick={handleShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '11px 16px',
                borderRadius: '10px',
                border: `1.5px solid ${theme.border}`,
                background: theme.background,
                color: theme.text,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {linkCopied ? <FaCheck size={14} /> : <FaShareAlt size={14} />}
              {linkCopied ? 'Link copiado!' : 'Compartilhar link de chat'}
            </button>
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '12px', color: theme.text, fontSize: '0.95rem' }}>
              Avatar
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, ${avatarSize}px)`,
                justifyContent: 'space-evenly',
                columnGap: '8px',
                rowGap: 'clamp(15px, 3vw, 22px)',
                maxHeight: '220px',
                overflowY: 'auto',
                scrollbarGutter: 'stable both-edges',
                padding: '24px 16px',
                background: theme.background,
                borderRadius: '18px',
                border: `1px solid ${theme.border}`,
              }}
            >
              {AVATARS.map((avatarOption, index) => {
                const isSelected = avatar === index;
                return (
                  <button
                    key={avatarOption.name}
                    onClick={() => setAvatar(index)}
                    style={{
                      width: `${avatarSize}px`,
                      height: `${avatarSize}px`,
                      borderRadius: '16px',
                      background: isSelected ? avatarOption.bgGradient : theme.surface,
                      border: isSelected ? `3px solid ${avatarOption.color}` : `2px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <avatarOption.icon size={iconSize} color={isSelected ? 'white' : theme.text} />
                  </button>
                );
              })}
            </div>
          </div>

          {profileError && <small style={{ color: '#ef4444' }}>{profileError}</small>}

          {hasChanges && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setNickname(user.nickname);
                  setAvatar(user.avatar);
                }}
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
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProfile}
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
                }}
              >
                Salvar Alterações
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {needsCurrentPassword ? (
            <PasswordField
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Senha atual"
              theme={passwordFieldTheme}
              dense
            />
          ) : (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                background: 'rgba(102, 126, 234, 0.12)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.82rem',
                color: theme.textSecondary,
              }}
            >
              <FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Você entrou com o arquivo de recuperação — pode trocar a senha sem informar a atual.</span>
            </div>
          )}

          <div style={{ marginTop: '14px' }}>
            <PasswordField
              value={newPassword}
              onChange={setNewPassword}
              placeholder={`Nova senha (mín. ${PASSWORD_MIN_LENGTH} caracteres)`}
              theme={passwordFieldTheme}
              dense
            />
            <PasswordFieldHint length={newPassword.length} maxLength={PASSWORD_MIN_LENGTH} textSecondary={theme.textSecondary} />
          </div>

          {newPassword.length > 0 && (
            <div className="animate__animated animate__fadeIn animate__faster">
              <PasswordField
                value={confirmNewPassword}
                onChange={setConfirmNewPassword}
                placeholder="Confirmar nova senha"
                theme={passwordFieldTheme}
                matchStatus={getPasswordMatchStatus(confirmNewPassword, newPassword)}
                dense
              />
              <PasswordFieldHint
                length={confirmNewPassword.length}
                maxLength={PASSWORD_MIN_LENGTH}
                textSecondary={theme.textSecondary}
                matchStatus={getPasswordMatchStatus(confirmNewPassword, newPassword)}
              />
            </div>
          )}

          {passwordError && <small style={{ color: '#ef4444' }}>{passwordError}</small>}
          {passwordError === WRONG_PASSWORD_MESSAGE && (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                background: 'rgba(102, 126, 234, 0.12)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.82rem',
                color: theme.textSecondary,
              }}
            >
              <FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                Esqueceu a senha? Saia e entre de novo com o seu arquivo de recuperação — assim você pode trocar a
                senha sem precisar da atual.
              </span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              background: 'rgba(239, 68, 68, 0.12)',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '0.82rem',
              color: theme.textSecondary,
            }}
          >
            <FaExclamationTriangle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>Trocar a senha desconecta todos os dispositivos, inclusive este — você vai precisar entrar de novo.</span>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={changePasswordDisabled}
            style={{
              padding: '11px 16px',
              borderRadius: '10px',
              border: 'none',
              background: theme.headerGradient,
              color: 'white',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: changePasswordDisabled ? 'not-allowed' : 'pointer',
              opacity: changePasswordDisabled ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaLock size={14} />
            Trocar senha
          </button>

          <div style={{ borderTop: `1.5px solid ${theme.border}`, margin: '10px 0' }} />

          {regenerateError && <small style={{ color: '#ef4444' }}>{regenerateError}</small>}
          <button
            onClick={handleRegenerateRecoveryFile}
            style={{
              padding: '11px 16px',
              borderRadius: '10px',
              border: `1.5px solid ${theme.border}`,
              background: theme.background,
              color: theme.text,
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaFileDownload size={14} />
            Baixar arquivo de recuperação
          </button>
        </div>
      )}

      {activeTab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              background: theme.background,
              border: `1.5px solid ${theme.border}`,
              borderRadius: '10px',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {soundEnabled ? (
                <FaVolumeUp size={16} color={theme.text} />
              ) : (
                <FaVolumeMute size={16} color={theme.textSecondary} />
              )}
              <span style={{ fontWeight: 600, color: theme.text, fontSize: '0.95rem' }}>Sons do app</span>
            </div>
            <Switch checked={soundEnabled} onChange={onToggleSound} accentColor={theme.primary} trackColor={theme.border} />
          </div>

          <div>
            <small style={{ color: theme.textSecondary, display: 'block', marginBottom: '8px' }}>
              Dispositivos com sessão ativa
            </small>
            {sessions.length === 0 ? (
              <small style={{ color: theme.textSecondary }}>Nenhuma outra sessão ativa.</small>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      background: theme.background,
                      border: session.isCurrent ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
                      borderRadius: '10px',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.text }}>
                        {session.device}
                        {session.isCurrent && (
                          <span style={{ color: theme.primary, fontWeight: 600 }}> · Este dispositivo</span>
                        )}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: theme.textSecondary }}>
                        {AUTH_METHOD_LABEL[session.authMethod]} · Último uso: {formatSessionDate(session.lastUsedAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      title="Encerrar esta sessão"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <FaSignOutAlt size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <RecoveryFileDownloadDialog
        isOpen={recoveryFilePrompt !== null}
        userId={user.id}
        nickname={nickname}
        recoveryFile={recoveryFilePrompt ?? ''}
        onClose={handleRecoveryDialogClose}
        theme={theme}
      />
    </Modal>
  );
}
