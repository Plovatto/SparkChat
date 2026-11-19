import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaCheck,
  FaDesktop,
  FaExclamationTriangle,
  FaEye,
  FaEyeSlash,
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
import { useProtectIp } from '@features/calls/lib/call-settings';
import { Modal } from '@components/common/Modal';
import { Spinner } from '@components/common/Spinner';
import { RecoveryFileDownloadDialog } from '@components/common/RecoveryFileDownloadDialog';
import { Switch } from '@components/common/Switch';
import type { User } from '@features/auth';
import { PasswordField, PasswordFieldHint } from '@features/auth/components/PasswordField';
import { AVATARS } from '@features/auth/constants/avatars';
import { NICKNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@features/auth/constants/validation';
import { useResponsiveAvatarSize } from '@features/auth/hooks/useResponsiveAvatarSize';
import { getPasswordMatchStatus } from '@features/auth/lib/password-match';
import { useTheme, withAlpha } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { buildRecoveryFile } from '@lib/e2ee';
import { ensureAutoSavePermission, tryAutoOverwrite } from '@lib/recovery-file-storage';
import { shareLinkNatively } from '@lib/share-link';
import { translateError, translateErrorPayload } from '@lib/api/api-error';
import { formatDateTime } from '@lib/format';
import { translate, useOnLanguageChange } from '@lib/i18n/app-i18n';
import { useSocket, type SessionSummary, type SocketErrorPayload, type SocketUser } from '@lib/socket';
import { PushNotificationsRow } from '@features/pwa/components/PushNotificationsRow';
import {
  buildChangePasswordRequest,
  buildRegenerateRecoveryRequest,
  IdentityUnavailableError,
  resolveProfileUpdateProof,
} from '../utils/credential-requests';
import { buildProfileUpdatePayload, isNicknameChange } from '../utils/profile-update';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUserUpdate: (patch: Partial<User>) => void;
  onLogout: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  notificationContentHidden: boolean;
  onToggleNotificationContent: () => void;
}

type ProfileTab = 'profile' | 'security' | 'system';
type PendingAction = 'profile' | 'password' | 'regenerate';

const LOGOUT_AFTER_PASSWORD_CHANGE_MS = 1600;

const TABS: { id: ProfileTab; icon: typeof FaUser }[] = [
  { id: 'profile', icon: FaUser },
  { id: 'security', icon: FaShieldAlt },
  { id: 'system', icon: FaDesktop },
];

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

interface SettingRowProps {
  icon: ReactNode;
  labelId: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}

function SettingRow({ icon, labelId, label, checked, onChange }: SettingRowProps) {
  const { theme } = useTheme();

  return (
    <div className="sc-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '10px', padding: '16px 16px', minHeight: '58px', boxSizing: 'border-box' }}>
      <span aria-hidden="true" style={{ width: '20px', display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <span id={labelId} style={{ flex: 1, minWidth: 0, fontWeight: 600, color: theme.textPrimary, fontSize: '0.92rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
        {label}
      </span>
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>
        <Switch checked={checked} onChange={onChange} aria-labelledby={labelId} />
      </span>
    </div>
  );
}

export function EditProfileModal({
  isOpen,
  onClose,
  user,
  onUserUpdate,
  onLogout,
  soundEnabled,
  onToggleSound,
  notificationContentHidden,
  onToggleNotificationContent,
}: EditProfileModalProps) {
  const soundsLabelId = useId();
  const callProtectIpLabelId = useId();
  const [protectCallIp, setProtectCallIp] = useProtectIp();
  const notificationContentLabelId = useId();
  const { t } = useTranslation();
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
  const [isWrongPassword, setIsWrongPassword] = useState(false);

  const [profileError, setProfileError] = useState('');
  useAutoDismiss(profileError, setProfileError);
  const [profilePassword, setProfilePassword] = useState('');
  const [isConfirmingRegenerate, setIsConfirmingRegenerate] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState('');
  const [isCurrentPasswordRequired, setIsCurrentPasswordRequired] = useState(false);

  const [regenerateError, setRegenerateError] = useState('');
  useAutoDismiss(regenerateError, setRegenerateError);
  useOnLanguageChange(() => {
    setPasswordError('');
    setProfileError('');
    setRegenerateError('');
  });

  const [autoSaveFeedback, setAutoSaveFeedback] = useState('');
  useAutoDismiss(autoSaveFeedback, setAutoSaveFeedback);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [recoveryFilePrompt, setRecoveryFilePrompt] = useState<string | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const pendingRecoverySecretRef = useRef<Uint8Array | null>(null);
  const [isDeriving, setIsDeriving] = useState(false);
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
      setProfilePassword('');
      setIsConfirmingRegenerate(false);
      setRegeneratePassword('');
      setIsCurrentPasswordRequired(false);
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
        setAutoSaveFeedback(translate('profile.autoSaved'));
      }
      return saved;
    };

    const discardPendingRecoverySecret = () => {
      pendingRecoverySecretRef.current?.fill(0);
      pendingRecoverySecretRef.current = null;
    };

    const takeLocalRecoveryFile = async (): Promise<string | null> => {
      const secret = pendingRecoverySecretRef.current;
      pendingRecoverySecretRef.current = null;
      if (!secret) {
        return null;
      }
      try {
        return await buildRecoveryFile({ userId: user.id, nickname: user.nickname, secret });
      } finally {
        secret.fill(0);
      }
    };

    const handleProfileUpdated = ({ user: updated }: { user: SocketUser }) => {
      pendingActionRef.current = null;
      setProfilePassword('');
      onUserUpdate({ nickname: updated.nickname, avatar: updated.avatar });
      onClose();
    };

    const handlePasswordChanged = () => {
      pendingActionRef.current = null;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setAutoSaveFeedback(translate('profile.passwordChangedSigningOut'));
      setTimeout(onLogout, LOGOUT_AFTER_PASSWORD_CHANGE_MS);
    };

    const handleRecoveryFileRegenerated = async () => {
      pendingActionRef.current = null;
      setIsConfirmingRegenerate(false);
      setRegeneratePassword('');
      const recoveryFile = await takeLocalRecoveryFile();
      if (!recoveryFile) {
        return;
      }
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

    const handleError = (payload: SocketErrorPayload) => {
      if (payload.clientTempId || payload.event) {
        return;
      }
      const message = translateErrorPayload(payload, 'errors.generic');
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action === 'regenerate') {
        discardPendingRecoverySecret();
      }
      if (action === 'password') {
        setPasswordError(message);
        setIsWrongPassword(payload.code === 'user.currentPasswordIncorrect');
        if (payload.code === 'user.currentPasswordRequired') {
          setIsCurrentPasswordRequired(true);
        }
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
  const isNicknameChanging = isNicknameChange(user.nickname, nickname);
  const saveProfileDisabled = (isNicknameChanging && !profilePassword) || isDeriving;

  const credentialErrorMessage = (error: unknown): string =>
    error instanceof IdentityUnavailableError ? t('profile.identityUnavailable') : translateError(error, 'errors.generic');

  const handleSaveProfile = async () => {
    if (saveProfileDisabled || !socket) {
      return;
    }
    setProfileError('');
    void ensureAutoSavePermission(user.id);
    let proof = '';
    if (isNicknameChanging) {
      setIsDeriving(true);
      try {
        proof = await resolveProfileUpdateProof(user.id, user.nickname, profilePassword);
      } catch (error) {
        setProfileError(credentialErrorMessage(error));
        return;
      } finally {
        setIsDeriving(false);
      }
    }
    pendingActionRef.current = 'profile';
    socket.emit('user:update-profile', buildProfileUpdatePayload(user.nickname, nickname, avatar, proof));
  };

  const handleShare = () => {
    const link = `${window.location.origin}${window.location.pathname}?startChat=${encodeURIComponent(user.nickname)}`;
    if (!shareLinkNatively({ text: t('profile.shareText', { name: user.nickname }), url: link })) {
      clipboard.copy(link);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');

    if (!socket || isDeriving) {
      return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError(t('profile.newPasswordTooShort', { minLength: PASSWORD_MIN_LENGTH }));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('auth.passwordsMismatch'));
      return;
    }

    setIsDeriving(true);
    try {
      const request = await buildChangePasswordRequest({ socket, userId: user.id, nickname: user.nickname }, currentPassword, newPassword);
      pendingActionRef.current = 'password';
      socket.emit('user:change-password', request.payload);
    } catch (error) {
      setPasswordError(credentialErrorMessage(error));
    } finally {
      setIsDeriving(false);
    }
  };

  const handleRegenerateRecoveryFile = async () => {
    if (!regeneratePassword || !socket || isDeriving) {
      return;
    }
    setRegenerateError('');
    void ensureAutoSavePermission(user.id);
    setIsDeriving(true);
    try {
      const request = await buildRegenerateRecoveryRequest({ socket, userId: user.id, nickname: user.nickname }, regeneratePassword);
      pendingRecoverySecretRef.current?.fill(0);
      pendingRecoverySecretRef.current = request.recoverySecret;
      pendingActionRef.current = 'regenerate';
      socket.emit('user:regenerate-recovery-file', request.payload);
    } catch (error) {
      setRegenerateError(credentialErrorMessage(error));
    } finally {
      setIsDeriving(false);
    }
  };

  const handleCancelRegenerate = () => {
    setIsConfirmingRegenerate(false);
    setRegeneratePassword('');
    setRegenerateError('');
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
    onClose();
  };

  const labelStyle: CSSProperties = { fontWeight: 600, display: 'block', marginBottom: '10px', color: theme.textPrimary, fontSize: '0.95rem' };
  const needsCurrentPassword = user.authMethod !== 'keyfile' || isCurrentPasswordRequired;
  const changePasswordDisabled = !newPassword || !confirmNewPassword || (needsCurrentPassword && !currentPassword) || isDeriving;
  const otherSessionsCount = sessions.filter((session) => !session.isCurrent).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={recoveryFilePrompt === null ? onClose : () => {}}
      showCloseButton={recoveryFilePrompt === null}
      title={t('profile.title')}
      maxWidth="600px"
    >
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, marginBottom: '20px' }}>
        {TABS.map(({ id, icon: Icon }) => (
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
            {t(`profile.tabs.${id}`)}
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
              <label style={labelStyle}>{t('profile.username')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={NICKNAME_MAX_LENGTH}
                  placeholder={t('profile.usernamePlaceholder')}
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
              {clipboard.isCopied() ? t('profile.linkCopied') : t('profile.shareLink')}
            </button>
          </div>

          <div>
            <label style={{ ...labelStyle, marginBottom: '12px' }}>{t('profile.avatar')}</label>
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
                    title={translate(`avatars.${avatarOption.name}`)}
                    aria-label={translate(`avatars.${avatarOption.name}`)}
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

          {hasChanges && isNicknameChanging && (
            <div className="sc-anim-rise-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <InfoNotice icon={<FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="info">
                {t('profile.nicknamePasswordHint')}
              </InfoNotice>
              <PasswordField
                value={profilePassword}
                onChange={setProfilePassword}
                placeholder={t('profile.currentPassword')}
                autoComplete="current-password"
                dense
              />
            </div>
          )}

          {profileError && <small key={profileError} className="sc-anim-shake" style={{ color: theme.dangerText, fontWeight: 600 }}>{profileError}</small>}

          {hasChanges && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setNickname(user.nickname);
                  setAvatar(user.avatar);
                  setProfilePassword('');
                }}
                className="sc-btn sc-btn--secondary"
                style={{ flex: 1, padding: '12px 20px' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => void handleSaveProfile()}
                disabled={saveProfileDisabled}
                className="sc-btn sc-btn--gradient sc-btn--lift"
                style={{ flex: 1, padding: '12px 20px' }}
              >
                {isDeriving && <Spinner size={14} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} />}
                {t('profile.saveChanges')}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className="sc-anim-rise-in" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {needsCurrentPassword ? (
            <PasswordField value={currentPassword} onChange={setCurrentPassword} placeholder={t('profile.currentPassword')} autoComplete="current-password" dense />
          ) : (
            <InfoNotice icon={<FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="info">
              {t('profile.keyfileNoCurrent')}
            </InfoNotice>
          )}

          <div style={{ marginTop: '9px' }}>
            <PasswordField value={newPassword} onChange={setNewPassword} placeholder={t('profile.newPasswordPlaceholder', { minLength: PASSWORD_MIN_LENGTH })} dense />
            <PasswordFieldHint length={newPassword.length} maxLength={PASSWORD_MIN_LENGTH} />
          </div>

          {newPassword.length > 0 && (
            <div className="sc-anim-rise-in">
              <PasswordField
                value={confirmNewPassword}
                onChange={setConfirmNewPassword}
                placeholder={t('profile.confirmNewPassword')}
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
          {passwordError && isWrongPassword && (
            <InfoNotice icon={<FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="info">
              {t('profile.forgotPassword')}
            </InfoNotice>
          )}

          {newPassword.length > 0 && (
            <>
              <InfoNotice icon={<FaExclamationTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="danger">
                {t('profile.changeLogsOut')}
              </InfoNotice>

              <button
                onClick={() => void handleChangePassword()}
                disabled={changePasswordDisabled}
                className="sc-btn sc-btn--gradient sc-btn--lift"
                style={{ padding: '11px 16px', fontSize: '0.9rem' }}
              >
                {isDeriving ? <Spinner size={14} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} /> : <FaLock size={14} />}
                {t('profile.changePassword')}
              </button>
            </>
          )}

          <div style={{ borderTop: `2px solid ${theme.borderStrong}`, margin: '14px 0' }} />

          {regenerateError && <small key={regenerateError} className="sc-anim-shake" style={{ color: theme.dangerText, fontWeight: 600 }}>{regenerateError}</small>}
          {isConfirmingRegenerate ? (
            <div className="sc-anim-rise-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <InfoNotice icon={<FaExclamationTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="danger">
                {t('profile.regeneratePasswordHint')}
              </InfoNotice>
              <PasswordField
                value={regeneratePassword}
                onChange={setRegeneratePassword}
                placeholder={t('profile.currentPassword')}
                autoComplete="current-password"
                dense
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleCancelRegenerate} className="sc-btn sc-btn--secondary" style={{ flex: 1, padding: '11px 16px', fontSize: '0.9rem' }}>
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => void handleRegenerateRecoveryFile()}
                  disabled={!regeneratePassword || isDeriving}
                  className="sc-btn sc-btn--gradient sc-btn--lift"
                  style={{ flex: 1, padding: '11px 16px', fontSize: '0.9rem' }}
                >
                  {isDeriving ? <Spinner size={14} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} /> : <FaFileDownload size={14} />}
                  {t('profile.confirmRegenerate')}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setIsConfirmingRegenerate(true)} className="sc-btn sc-btn--secondary" style={{ padding: '11px 16px', fontSize: '0.9rem' }}>
              <FaFileDownload size={14} />
              {t('profile.downloadRecovery')}
            </button>
          )}
        </div>
      )}

      {activeTab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <PushNotificationsRow />
          <SettingRow
            icon={soundEnabled ? <FaVolumeUp size={16} color={theme.accentText} /> : <FaVolumeMute size={16} color={theme.textMuted} />}
            labelId={soundsLabelId}
            label={t('profile.sounds')}
            checked={soundEnabled}
            onChange={onToggleSound}
          />
          <SettingRow
            icon={notificationContentHidden ? <FaEyeSlash size={16} color={theme.accentText} /> : <FaEye size={16} color={theme.textMuted} />}
            labelId={notificationContentLabelId}
            label={t('profile.hideNotificationContent')}
            checked={notificationContentHidden}
            onChange={onToggleNotificationContent}
          />
          <SettingRow
            icon={<FaShieldAlt size={16} color={protectCallIp ? theme.accentText : theme.textMuted} />}
            labelId={callProtectIpLabelId}
            label={t('profile.callProtectIp')}
            checked={protectCallIp}
            onChange={() => setProtectCallIp(!protectCallIp)}
          />

          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '6px 10px', marginBottom: '10px' }}>
              <small style={{ color: theme.textSecondary, overflowWrap: 'anywhere' }}>{t('profile.activeSessions')}</small>
              {otherSessionsCount > 0 && (
                <button onClick={handleRevokeOtherSessions} className="sc-btn sc-btn--text-danger" style={{ fontSize: '0.78rem' }}>
                  {t('profile.revokeOthers')}
                </button>
              )}
            </div>
            {sessions.length === 0 ? (
              <small style={{ color: theme.textSecondary }}>{t('profile.noOtherSessions')}</small>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="sc-card"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '10px',
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.textPrimary, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                        {session.device}
                        {session.isCurrent && <span style={{ color: theme.accentText, fontWeight: 600 }}> · {t('profile.thisDevice')}</span>}
                      </span>
                      <span style={{ fontSize: '0.76rem', color: theme.textSecondary, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                        {t(`profile.authMethod.${session.authMethod}`)}
                      </span>
                      <span style={{ fontSize: '0.76rem', color: theme.textSecondary, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                        {t('profile.lastUsed', { date: formatDateTime(session.lastUsedAt) })}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      title={t('profile.revokeSession')}
                      aria-label={t('profile.revokeSession')}
                      className="sc-icon-btn sc-icon-btn--danger-soft"
                      style={{ width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0 }}
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
