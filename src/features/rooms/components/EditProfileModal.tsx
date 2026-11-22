import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaCheck,
  FaExclamationTriangle,
  FaEye,
  FaEyeSlash,
  FaKey,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { Spinner } from '@components/common/Spinner';
import { RecoveryFileDownloadDialog } from '@components/common/RecoveryFileDownloadDialog';
import { Switch } from '@components/common/Switch';
import type { User } from '@features/auth';
import { PasswordField, PasswordFieldHint } from '@features/auth/components/PasswordField';
import { AvatarPicker } from '@features/auth/components/AvatarPicker';
import { useResponsiveAvatarSize } from '@features/auth/hooks/useResponsiveAvatarSize';
import { NICKNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@features/auth/constants/validation';
import { getPasswordMatchStatus } from '@features/auth/lib/password-match';
import { removeMyPhoto, uploadMyPhoto, useUserPhoto } from '@features/profile-photos';
import { ProfilePhotoViewer } from '@features/profile-photos/components/ProfilePhotoViewer';
import { usePhotoDraft } from '@features/profile-photos/hooks/usePhotoDraft';
import { usePhotoPicker } from '@features/profile-photos/hooks/usePhotoPicker';
import { useTheme, withAlpha } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { buildRecoveryFile } from '@lib/e2ee';
import { ensureAutoSavePermission, tryAutoOverwrite } from '@lib/recovery-file-storage';
import { shareLinkNatively } from '@lib/share-link';
import { translateError, translateErrorPayload } from '@lib/api/api-error';
import { translate, useOnLanguageChange } from '@lib/i18n/app-i18n';
import { LuCheck, LuDownload, LuInfo, LuLink, LuLock } from 'react-icons/lu';
import { useSocket, type SessionSummary, type SocketErrorPayload, type SocketUser } from '@lib/socket';
import { PushNotificationsRow } from '@features/pwa/components/PushNotificationsRow';
import {
  buildChangePasswordRequest,
  buildRegenerateRecoveryRequest,
  IdentityUnavailableError,
  resolveProfileUpdateProof,
} from '../utils/credential-requests';
import { buildProfileUpdatePayload, isNicknameChange } from '../utils/profile-update';
import { LanguageSettingRow } from './LanguageSettingRow';
import { SessionCard } from './SessionCard';
import '../styles/profile-modal.css';

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

const TABS: ProfileTab[] = ['profile', 'security', 'system'];

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
  const avatarLabelId = useId();
  const usernameInputId = useId();
  const { avatarSize } = useResponsiveAvatarSize();
  const soundsLabelId = useId();
  const notificationContentLabelId = useId();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { socket } = useSocket();
  const clipboard = useClipboardCopy();

  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [nickname, setNickname] = useState(user.nickname);
  const [avatar, setAvatar] = useState(user.avatar);
  const currentPhoto = useUserPhoto(user.id);
  const photo = usePhotoDraft(currentPhoto);
  const resetPhoto = photo.reset;
  const photoPicker = usePhotoPicker(photo.pick);
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

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
      resetPhoto();
      setViewerPhoto(null);
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
  }, [isOpen, user.nickname, user.avatar, socket, resetPhoto]);

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

  const hasProfileFieldChanges = nickname !== user.nickname || avatar !== user.avatar;
  const hasChanges = hasProfileFieldChanges || photo.saveAction !== 'none';
  const isNicknameChanging = isNicknameChange(user.nickname, nickname);
  const saveProfileDisabled = (isNicknameChanging && !profilePassword) || isDeriving || isSavingPhoto;

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
    if (photo.saveAction !== 'none') {
      setIsSavingPhoto(true);
      try {
        if (photo.saveAction === 'upload' && photo.pendingBlob) {
          await uploadMyPhoto(photo.pendingBlob);
        } else if (photo.saveAction === 'remove') {
          await removeMyPhoto();
        }
      } catch {
        setProfileError(t(photo.saveAction === 'upload' ? 'profilePhotos.errors.uploadFailed' : 'profilePhotos.errors.removeFailed'));
        return;
      } finally {
        setIsSavingPhoto(false);
      }
    }
    if (!hasProfileFieldChanges) {
      onClose();
      return;
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

  const needsCurrentPassword = user.authMethod !== 'keyfile' || isCurrentPasswordRequired;
  const changePasswordDisabled = !newPassword || !confirmNewPassword || (needsCurrentPassword && !currentPassword) || isDeriving;
  const otherSessionsCount = sessions.filter((session) => !session.isCurrent).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={viewerPhoto !== null ? () => setViewerPhoto(null) : recoveryFilePrompt === null ? onClose : () => {}}
      showCloseButton={recoveryFilePrompt === null}
      title={t('profile.title')}
      maxWidth="600px"
    >
      <div
        className="sc-profile-tabs"
        role="tablist"
        style={{ '--sc-profile-tab-count': TABS.length, '--sc-profile-tab-index': Math.max(0, TABS.indexOf(activeTab)) } as CSSProperties}
      >
        <span className="sc-profile-tabs__thumb" aria-hidden="true" />
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            data-active={activeTab === id}
            className="sc-profile-tabs__tab"
          >
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
        <div className="sc-profile-panel" style={{ gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="sc-profile-label" htmlFor={usernameInputId}>
                {t('profile.username')}
              </label>
              <input
                id={usernameInputId}
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder={t('profile.usernamePlaceholder')}
                className="sc-profile-input"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <button type="button" onClick={handleShare} className="sc-profile-share" data-copied={clipboard.isCopied()}>
              {clipboard.isCopied() ? <LuCheck size={18} aria-hidden="true" /> : <LuLink size={18} aria-hidden="true" />}
              {clipboard.isCopied() ? t('profile.linkCopied') : t('profile.shareLink')}
            </button>
          </div>

          <div>
            <span id={avatarLabelId} className="sc-profile-label">
              {t('profile.avatar')}
            </span>
            <AvatarPicker
              selectedAvatar={avatar}
              onSelectAvatar={(index) => {
                setAvatar(index);
                photo.selectPreset();
              }}
              photoUrl={photo.photoUrl}
              isPhotoSelected={photo.isSelected}
              isPhotoBusy={photoPicker.isPreparing || isSavingPhoto}
              onChoosePhoto={photoPicker.open}
              onSelectPhoto={photo.selectPhoto}
              onRemovePhoto={photo.remove}
              onViewPhoto={setViewerPhoto}
              labelledBy={avatarLabelId}
              kind={theme.kind}
              tileSize={avatarSize}
              iconSize={Math.round(avatarSize * 0.37)}
              panelMaxHeight={220}
            />
            {photoPicker.error && (
              <small key={photoPicker.error} role="alert" className="sc-anim-shake" style={{ display: 'block', marginTop: '10px', color: theme.dangerText, fontWeight: 600 }}>
                {photoPicker.error}
              </small>
            )}
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
                  photo.reset();
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
                {(isDeriving || isSavingPhoto) && <Spinner size={14} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} />}
                {isSavingPhoto ? t('profilePhotos.uploading') : t('profile.saveChanges')}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className="sc-profile-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {needsCurrentPassword ? (
              <PasswordField value={currentPassword} onChange={setCurrentPassword} placeholder={t('profile.currentPassword')} autoComplete="current-password" dense />
            ) : (
              <InfoNotice icon={<FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="info">
                {t('profile.keyfileNoCurrent')}
              </InfoNotice>
            )}

            <div>
              <PasswordField value={newPassword} onChange={setNewPassword} placeholder={t('profile.newPasswordPlaceholder', { minLength: PASSWORD_MIN_LENGTH })} dense />
              {newPassword.length > 0 && <PasswordFieldHint length={newPassword.length} maxLength={PASSWORD_MIN_LENGTH} />}
            </div>

            <div>
              <PasswordField
                value={confirmNewPassword}
                onChange={setConfirmNewPassword}
                placeholder={t('profile.confirmNewPassword')}
                matchStatus={getPasswordMatchStatus(confirmNewPassword, newPassword)}
                dense
              />
              {confirmNewPassword.length > 0 && (
                <PasswordFieldHint
                  length={confirmNewPassword.length}
                  maxLength={PASSWORD_MIN_LENGTH}
                  matchStatus={getPasswordMatchStatus(confirmNewPassword, newPassword)}
                />
              )}
            </div>

            {passwordError && <small key={passwordError} className="sc-anim-shake" style={{ color: theme.dangerText, fontWeight: 600 }}>{passwordError}</small>}
            {passwordError && isWrongPassword && (
              <InfoNotice icon={<FaKey size={13} style={{ flexShrink: 0, marginTop: '2px' }} />} tone="info">
                {t('profile.forgotPassword')}
              </InfoNotice>
            )}

            <div className="sc-profile-warning" role="note">
              <LuInfo size={20} aria-hidden="true" />
              <span>{t('profile.changeLogsOut')}</span>
            </div>

            <button type="button" onClick={() => void handleChangePassword()} disabled={changePasswordDisabled} className="sc-profile-cta">
              {isDeriving ? <Spinner size={16} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} /> : <LuLock size={18} aria-hidden="true" />}
              {t('profile.changePassword')}
            </button>
          </div>

          <hr className="sc-profile-divider" />

          <h3 className="sc-profile-section-title">{t('profile.recoveryTitle')}</h3>
          <p className="sc-profile-section-text">{t('profile.forgotPassword')}</p>

          {regenerateError && (
            <small key={regenerateError} className="sc-anim-shake" style={{ display: 'block', marginBottom: '10px', color: theme.dangerText, fontWeight: 600 }}>
              {regenerateError}
            </small>
          )}
          {isConfirmingRegenerate ? (
            <div className="sc-profile-panel" style={{ gap: '12px' }}>
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
                <button type="button" onClick={handleCancelRegenerate} className="sc-profile-outline-btn" style={{ flex: 1 }}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRegenerateRecoveryFile()}
                  disabled={!regeneratePassword || isDeriving}
                  className="sc-profile-outline-btn"
                  style={{ flex: 1 }}
                >
                  {isDeriving ? <Spinner size={16} /> : <LuDownload size={18} aria-hidden="true" />}
                  {t('profile.downloadNewRecovery')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setIsConfirmingRegenerate(true)} className="sc-profile-outline-btn">
              <LuDownload size={18} aria-hidden="true" />
              {t('profile.downloadNewRecovery')}
            </button>
          )}
        </div>
      )}

      {activeTab === 'system' && (
        <div className="sc-profile-panel" style={{ gap: '8px' }}>
          <LanguageSettingRow />
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

          <div className="sc-sessions-header">
            <h3 className="sc-sessions-header__title">{t('profile.activeSessions')}</h3>
            {otherSessionsCount > 0 && (
              <button type="button" onClick={handleRevokeOtherSessions} className="sc-sessions-header__revoke">
                {t('profile.revokeOthers')}
              </button>
            )}
          </div>
          {sessions.length === 0 ? (
            <small style={{ color: theme.textSecondary }}>{t('profile.noOtherSessions')}</small>
          ) : (
            <div className="sc-sessions-list">
              {sessions.map((session, index) => (
                <SessionCard key={session.id} session={session} index={index} onRevoke={handleRevokeSession} />
              ))}
            </div>
          )}
        </div>
      )}

      {photoPicker.element}
      <ProfilePhotoViewer photoUrl={viewerPhoto} onClose={() => setViewerPhoto(null)} />

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
