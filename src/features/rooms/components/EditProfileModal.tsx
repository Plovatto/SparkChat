import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
import type { User } from '@features/auth';
import { PasswordField, PasswordFieldHint } from '@features/auth/components/PasswordField';
import { AVATARS } from '@features/auth/constants/avatars';
import { NICKNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@features/auth/constants/validation';
import { useResponsiveAvatarSize } from '@features/auth/hooks/useResponsiveAvatarSize';
import { getPasswordMatchStatus } from '@features/auth/lib/password-match';
import { useTheme } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { rewrapIdentityAfterPasswordChange, rewrapIdentityAfterRecoveryRegenerate } from '@lib/e2ee';
import { ensureAutoSavePermission, tryAutoOverwrite } from '@lib/recovery-file-storage';
import { shareLinkNatively } from '@lib/share-link';
import { useSocket, type AuthMethod, type SessionSummary, type SocketUser } from '@lib/socket';

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
type PendingAction = 'profile' | 'password' | 'regenerate';

const WRONG_PASSWORD_MESSAGE = 'Senha atual incorreta.';
const LOGOUT_AFTER_PASSWORD_CHANGE_MS = 1600;

const AUTH_METHOD_LABEL: Record<AuthMethod, string> = {
  password: 'Entrou com senha',
  keyfile: 'Entrou com arquivo de recuperação',
};

const TABS: { id: ProfileTab; label: string; icon: typeof FaUser }[] = [
  { id: 'profile', label: 'Perfil', icon: FaUser },
  { id: 'security', label: 'Segurança', icon: FaShieldAlt },
  { id: 'system', label: 'Sistema', icon: FaDesktop },
];

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function buildRecoveryFileName(nickname: string): string {
  return `sparkchat-${nickname.toLowerCase()}.sparkkey`;
}

interface InfoNoticeProps {
  icon: ReactNode;
  tone: 'info' | 'danger';
  children: ReactNode;
}

function InfoNotice({ icon, tone, children }: InfoNoticeProps) {
  return (
    <div className={`sc-notice sc-notice--${tone}`} style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function EditProfileModal({ isOpen, onClose, user, onUserUpdate, onLogout, soundEnabled, onToggleSound }: EditProfileModalProps) {
  const { theme } = useTheme();
  const { socket } = useSocket();
  const { avatarSize, iconSize } = useResponsiveAvatarSize();
  const clipboard = useClipboardCopy();

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

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [recoveryFilePrompt, setRecoveryFilePrompt] = useState<string | null>(null);
  const [pendingLogoutAfterDownload, setPendingLogoutAfterDownload] = useState(false);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const pendingPasswordRef = useRef('');
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
      const saved = await tryAutoOverwrite(recoveryFile, buildRecoveryFileName(nicknameForFile), user.id);
      if (saved) {
        setAutoSaveFeedback('Arquivo de recuperação atualizado automaticamente.');
      }
      return saved;
    };

    const handleProfileUpdated = async ({
      user: updated,
      recoveryFile,
      recoveryToken,
    }: {
      user: SocketUser;
      recoveryFile: string | null;
      recoveryToken: string | null;
    }) => {
      pendingActionRef.current = null;
      onUserUpdate({ nickname: updated.nickname, avatar: updated.avatar });
      if (!recoveryFile || !recoveryToken) {
        onClose();
        return;
      }
      void rewrapIdentityAfterRecoveryRegenerate(socket, user.id, recoveryToken);
      if (await trySilentRecoveryFileUpdate(recoveryFile, updated.nickname)) {
        onClose();
        return;
      }
      setRecoveryFilePrompt(recoveryFile);
    };

    const handlePasswordChanged = async ({ recoveryFile, recoveryToken }: { recoveryFile: string; recoveryToken: string }) => {
      pendingActionRef.current = null;
      const changedPassword = pendingPasswordRef.current;
      pendingPasswordRef.current = '';
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      if (changedPassword) {
        void rewrapIdentityAfterPasswordChange(socket, user.id, changedPassword, recoveryToken);
      }
      if (await trySilentRecoveryFileUpdate(recoveryFile, user.nickname)) {
        setTimeout(onLogout, LOGOUT_AFTER_PASSWORD_CHANGE_MS);
        return;
      }
      setPendingLogoutAfterDownload(true);
      setRecoveryFilePrompt(recoveryFile);
    };

    const handleRecoveryFileRegenerated = async ({ recoveryFile, recoveryToken }: { recoveryFile: string; recoveryToken: string }) => {
      pendingActionRef.current = null;
      void rewrapIdentityAfterRecoveryRegenerate(socket, user.id, recoveryToken);
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
        pendingPasswordRef.current = '';
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
    if (!shareLinkNatively({ text: `Fale comigo no SparkChat! Meu username é ${user.nickname}`, url: link })) {
      clipboard.copy(link);
    }
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
    pendingPasswordRef.current = newPassword;
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

  const handleRevokeOtherSessions = () => {
    for (const session of sessions) {
      if (!session.isCurrent) {
        socket?.emit('user:revoke-session', { sessionId: session.id });
      }
    }
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

  const labelStyle: CSSProperties = { fontWeight: 600, display: 'block', marginBottom: '10px', color: theme.textPrimary, fontSize: '0.95rem' };
  const needsCurrentPassword = user.authMethod !== 'keyfile';
  const changePasswordDisabled = !newPassword || !confirmNewPassword || (needsCurrentPassword && !currentPassword);
  const otherSessionsCount = sessions.filter((session) => !session.isCurrent).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={recoveryFilePrompt === null ? onClose : () => {}}
      showCloseButton={recoveryFilePrompt === null}
      title="Editar Perfil"
      maxWidth="600px"
    >
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, marginBottom: '20px' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            data-active={activeTab === id}
            className="sc-tab"
            style={{
              flex: 1,
              padding: '12px 8px',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderRadius: '8px 8px 0 0',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {autoSaveFeedback && (
        <div key={autoSaveFeedback} className="sc-notice sc-notice--success sc-anim-rise-in" style={{ alignItems: 'center', fontWeight: 600, marginBottom: '20px', padding: '10px 14px' }}>
          <FaCheck size={13} style={{ flexShrink: 0 }} />
          <span>{autoSaveFeedback}</span>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="sc-anim-rise-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Username</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={NICKNAME_MAX_LENGTH}
                  placeholder="Digite seu username"
                  className="sc-input"
                  style={{ padding: '15px clamp(14px, 3vw, 22px)', paddingRight: '46px', borderRadius: '14px', fontSize: '0.95rem' }}
                />
                <FaPen
                  size={14}
                  color={theme.textMuted}
                  style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
              </div>
            </div>

            <button onClick={handleShare} className="sc-btn sc-btn--secondary" style={{ padding: '11px 16px', fontSize: '0.9rem' }}>
              {clipboard.isCopied() ? <FaCheck size={14} /> : <FaShareAlt size={14} />}
              {clipboard.isCopied() ? 'Link copiado!' : 'Compartilhar link de chat'}
            </button>
          </div>

          <div>
            <label style={{ ...labelStyle, marginBottom: '12px' }}>Avatar</label>
            <div
              className="sc-card"
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
                borderRadius: '18px',
              }}
            >
              {AVATARS.map((avatarOption, index) => {
                const isSelected = avatar === index;
                return (
                  <button
                    key={avatarOption.name}
                    onClick={() => setAvatar(index)}
                    data-selected={isSelected}
                    title={avatarOption.name}
                    className={`sc-avatar-option${isSelected ? '' : ' sc-anim-tile-in sc-stagger'}`}
                    style={
                      {
                        width: `${avatarSize}px`,
                        height: `${avatarSize}px`,
                        '--avatar-gradient': avatarOption.bgGradient,
                        '--avatar-color': avatarOption.color,
                        '--sc-stagger-index': Math.min(index, 11),
                        '--sc-stagger-step': '22ms',
                      } as CSSProperties
                    }
                  >
                    <avatarOption.icon size={iconSize} />
                  </button>
                );
              })}
            </div>
          </div>

          {profileError && <small key={profileError} className="sc-anim-shake" style={{ color: theme.dangerText, fontWeight: 600 }}>{profileError}</small>}

          {hasChanges && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setNickname(user.nickname);
                  setAvatar(user.avatar);
                }}
                className="sc-btn sc-btn--secondary"
                style={{ flex: 1, padding: '12px 20px' }}
              >
                Cancelar
              </button>
              <button onClick={handleSaveProfile} className="sc-btn sc-btn--gradient sc-btn--lift" style={{ flex: 1, padding: '12px 20px' }}>
                Salvar Alterações
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className="sc-anim-rise-in" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {needsCurrentPassword ? (
            <PasswordField value={currentPassword} onChange={setCurrentPassword} placeholder="Senha atual" dense />
          ) : (
            <InfoNotice icon={<FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="info">
              Você entrou com o arquivo de recuperação — pode trocar a senha sem informar a atual.
            </InfoNotice>
          )}

          <div style={{ marginTop: '9px' }}>
            <PasswordField value={newPassword} onChange={setNewPassword} placeholder={`Nova senha (mín. ${PASSWORD_MIN_LENGTH} caracteres)`} dense />
            <PasswordFieldHint length={newPassword.length} maxLength={PASSWORD_MIN_LENGTH} />
          </div>

          {newPassword.length > 0 && (
            <div className="sc-anim-rise-in">
              <PasswordField
                value={confirmNewPassword}
                onChange={setConfirmNewPassword}
                placeholder="Confirmar nova senha"
                matchStatus={getPasswordMatchStatus(confirmNewPassword, newPassword)}
                dense
              />
              <PasswordFieldHint
                length={confirmNewPassword.length}
                maxLength={PASSWORD_MIN_LENGTH}
                matchStatus={getPasswordMatchStatus(confirmNewPassword, newPassword)}
              />
            </div>
          )}

          {passwordError && <small key={passwordError} className="sc-anim-shake" style={{ color: theme.dangerText, fontWeight: 600 }}>{passwordError}</small>}
          {passwordError === WRONG_PASSWORD_MESSAGE && (
            <InfoNotice icon={<FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="info">
              Esqueceu a senha? Saia e entre de novo com o seu arquivo de recuperação — assim você pode trocar a senha sem precisar da
              atual.
            </InfoNotice>
          )}

          {newPassword.length > 0 && (
            <>
              <InfoNotice icon={<FaExclamationTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="danger">
                Trocar a senha desconecta todos os dispositivos, inclusive este — você vai precisar entrar de novo.
              </InfoNotice>

              <button
                onClick={handleChangePassword}
                disabled={changePasswordDisabled}
                className="sc-btn sc-btn--gradient sc-btn--lift"
                style={{ padding: '11px 16px', fontSize: '0.9rem' }}
              >
                <FaLock size={14} />
                Trocar senha
              </button>
            </>
          )}

          <div style={{ borderTop: `2px solid ${theme.borderStrong}`, margin: '14px 0' }} />

          {regenerateError && <small key={regenerateError} className="sc-anim-shake" style={{ color: theme.dangerText, fontWeight: 600 }}>{regenerateError}</small>}
          <button onClick={handleRegenerateRecoveryFile} className="sc-btn sc-btn--secondary" style={{ padding: '11px 16px', fontSize: '0.9rem' }}>
            <FaFileDownload size={14} />
            Baixar arquivo de recuperação
          </button>
        </div>
      )}

      {activeTab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            className="sc-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              borderRadius: '10px',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {soundEnabled ? <FaVolumeUp size={16} color={theme.accentText} /> : <FaVolumeMute size={16} color={theme.textMuted} />}
              <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '0.95rem' }}>Sons do app</span>
            </div>
            <Switch checked={soundEnabled} onChange={onToggleSound} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
              <small style={{ color: theme.textSecondary }}>Dispositivos com sessão ativa</small>
              {otherSessionsCount > 0 && (
                <button onClick={handleRevokeOtherSessions} className="sc-btn sc-btn--text-danger" style={{ fontSize: '0.78rem' }}>
                  Encerrar todas as outras
                </button>
              )}
            </div>
            {sessions.length === 0 ? (
              <small style={{ color: theme.textSecondary }}>Nenhuma outra sessão ativa.</small>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="sc-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      borderRadius: '10px',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: theme.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {session.device}
                        {session.isCurrent && <span style={{ color: theme.accentText, fontWeight: 600 }}> · Este dispositivo</span>}
                      </span>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          color: theme.textSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                      >
                        {AUTH_METHOD_LABEL[session.authMethod]} · Último uso: {formatSessionDate(session.lastUsedAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      title="Encerrar esta sessão"
                      className="sc-icon-btn sc-icon-btn--danger-soft"
                      style={{ width: '34px', height: '34px', borderRadius: '9px' }}
                    >
                      <FaSignOutAlt size={15} />
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
      />
    </Modal>
  );
}
