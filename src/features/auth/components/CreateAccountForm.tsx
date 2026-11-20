import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { LuLock, LuPalette, LuPencilLine } from 'react-icons/lu';
import { Spinner } from '@components/common/Spinner';
import { usePhotoDraft } from '@features/profile-photos/hooks/usePhotoDraft';
import { usePhotoPicker } from '@features/profile-photos/hooks/usePhotoPicker';
import { withAlpha, type ThemeTokens } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { prepareRegistrationCredentials } from '@lib/e2ee';
import { useOnLanguageChange } from '@lib/i18n/app-i18n';
import { NICKNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants/validation';
import { useNicknameAvailability, type NicknameCheckState } from '../hooks/useNicknameAvailability';
import { getPasswordMatchStatus } from '../lib/password-match';
import type { PendingRegistration } from '../types';
import { AuthErrorAlert } from './AuthErrorAlert';
import { AvatarPicker } from './AvatarPicker';
import { AutofillDecoyFields } from './AutofillDecoyFields';
import { PasswordField } from './PasswordField';
import { WelcomeHint } from './welcome-form-parts';
import { stagger } from './welcome-stagger';
import { WelcomeFormHero } from './WelcomeControls';

interface CreateAccountFormProps {
  darkMode: boolean;
  theme: ThemeTokens;
  onToggleTheme: () => void;
  onBack: () => void;
  onSubmit: (input: PendingRegistration) => void;
  registerError?: string;
}

const AVATAR_TILE_SIZE = { avatarSize: 52, iconSize: 22 };

type ResolvedNicknameCheckState = Exclude<NicknameCheckState, 'idle'>;

function sanitizeNicknameInput(value: string): string {
  return value.replace(/[^\p{L}\p{N}]/gu, '');
}

export function CreateAccountForm({ darkMode, theme, onToggleTheme, onBack, onSubmit, registerError }: CreateAccountFormProps) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const photo = usePhotoDraft(null);
  const photoPicker = usePhotoPicker(photo.pick);
  useOnLanguageChange(() => setError(''));
  useAutoDismiss(error, setError);

  useEffect(() => {
    if (registerError) {
      setError(registerError);
    }
  }, [registerError]);

  const nicknameStatus = useNicknameAvailability(nickname);
  const { avatarSize, iconSize } = AVATAR_TILE_SIZE;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isPreparing) {
      return;
    }

    if (!nickname.trim()) {
      setError(t('auth.register.enterUsername'));
      return;
    }

    if (nicknameStatus !== 'available') {
      setError(t('auth.register.chooseValid'));
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t('auth.register.passwordTooShort', { minLength: PASSWORD_MIN_LENGTH }));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.register.passwordsMismatch'));
      return;
    }

    setIsPreparing(true);
    try {
      const credentials = await prepareRegistrationCredentials(password);
      const chosenPhoto = photo.isSelected ? (photo.pendingBlob ?? undefined) : undefined;
      onSubmit({ nickname: nickname.trim(), avatar: selectedAvatar, credentials, photo: chosenPhoto });
    } catch {
      setError(t('errors.generic'));
    } finally {
      setIsPreparing(false);
    }
  };

  const nicknameStatusColor: Record<ResolvedNicknameCheckState, string> = {
    checking: theme.textMuted,
    available: theme.successText,
    taken: theme.dangerText,
    invalid: theme.dangerText,
  };

  const confirmMatch = getPasswordMatchStatus(confirmPassword, password);

  return (
    <section className="welcome-card welcome-card--form welcome-card--register" aria-labelledby="register-title">
      <WelcomeFormHero
        darkMode={darkMode}
        onToggleTheme={onToggleTheme}
        onBack={onBack}
        titleId="register-title"
        title={t('auth.register.title')}
        subtitle={t('auth.register.subtitle')}
      />

      <div className="welcome-body welcome-body--form">
        <form className="welcome-form" onSubmit={(event) => void handleSubmit(event)} autoComplete="off">
          <AutofillDecoyFields />

          <div className="welcome-field-group" style={stagger(0)}>
            <span className="welcome-label" id="register-avatar-label">
              <LuPalette size={15} aria-hidden="true" />
              {t('auth.register.avatar')}
            </span>
            <AvatarPicker
              selectedAvatar={selectedAvatar}
              onSelectAvatar={(index) => {
                setSelectedAvatar(index);
                photo.selectPreset();
              }}
              photoUrl={photo.photoUrl}
              isPhotoSelected={photo.isSelected}
              isPhotoBusy={photoPicker.isPreparing}
              onChoosePhoto={photoPicker.open}
              onSelectPhoto={photo.selectPhoto}
              onRemovePhoto={photo.remove}
              labelledBy="register-avatar-label"
              kind={darkMode ? 'dark' : 'light'}
              tileSize={avatarSize}
              iconSize={iconSize}
              entranceDelayMs={640}
            />
            {photoPicker.error && (
              <small key={photoPicker.error} role="alert" className="welcome-field-error sc-anim-shake">
                {photoPicker.error}
              </small>
            )}
            {photoPicker.element}
          </div>

          <div className="welcome-field-group" style={stagger(1)}>
            <label className="welcome-label" htmlFor="register-username">
              <LuPencilLine size={15} aria-hidden="true" />
              {t('auth.register.username')}
            </label>
            <div className="welcome-input-wrap">
              <input
                id="register-username"
                type="text"
                placeholder={t('auth.register.usernamePlaceholder')}
                value={nickname}
                onChange={(event) => setNickname(sanitizeNicknameInput(event.target.value))}
                maxLength={NICKNAME_MAX_LENGTH}
                autoComplete="one-time-code"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="sparkchat-field-a"
                data-valid={nicknameStatus === 'available'}
                data-invalid={nicknameStatus === 'taken' || nicknameStatus === 'invalid'}
                aria-describedby="register-username-status"
                className="welcome-input"
                style={{ paddingRight: '44px' }}
              />
              {nickname.trim().length > 0 && (
                <span className="welcome-input-adornment" key={nicknameStatus}>
                  {nicknameStatus === 'checking' && <Spinner size={16} />}
                  {nicknameStatus === 'available' && <FaCheckCircle size={17} color={theme.successText} />}
                  {(nicknameStatus === 'taken' || nicknameStatus === 'invalid') && <FaTimesCircle size={17} color={theme.dangerText} />}
                </span>
              )}
            </div>
            <div className="welcome-hint" id="register-username-status" aria-live="polite">
              <span
                key={nicknameStatus}
                className="welcome-hint__status"
                style={{ color: nicknameStatus === 'idle' ? 'transparent' : nicknameStatusColor[nicknameStatus] }}
              >
                {nicknameStatus === 'idle' ? '' : t(`auth.register.${nicknameStatus}`)}
              </span>
              <span className="welcome-hint__count">
                {nickname.length}/{NICKNAME_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="welcome-field-group" style={stagger(2)}>
            <label className="welcome-label" htmlFor="register-password">
              <LuLock size={15} aria-hidden="true" />
              {t('auth.register.password')}
            </label>
            <PasswordField
              id="register-password"
              appearance="welcome"
              value={password}
              onChange={setPassword}
              placeholder={t('auth.register.passwordPlaceholder')}
            />
            <WelcomeHint length={password.length} maxLength={PASSWORD_MIN_LENGTH} />
          </div>

          {password.length > 0 && (
            <div className="welcome-field-group welcome-field-group--reveal">
              <label className="welcome-label" htmlFor="register-confirm">
                <LuLock size={15} aria-hidden="true" />
                {t('auth.register.confirmPassword')}
              </label>
              <PasswordField
                id="register-confirm"
                appearance="welcome"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t('auth.register.confirmPlaceholder')}
                matchStatus={confirmMatch}
              />
              <WelcomeHint length={confirmPassword.length} maxLength={PASSWORD_MIN_LENGTH} matchStatus={confirmMatch} />
            </div>
          )}

          {error && <AuthErrorAlert key={error} message={error} marginBottom="16px" />}

          <button
            type="submit"
            disabled={isPreparing}
            className="welcome-cta welcome-cta--primary welcome-cta--submit"
            style={{ ...stagger(3), cursor: isPreparing ? 'wait' : undefined }}
          >
            {isPreparing ? (
              <Spinner size={18} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} />
            ) : (
              <FaCheckCircle size={17} aria-hidden="true" />
            )}
            <span>{isPreparing ? t('auth.register.submitting') : t('auth.register.submit')}</span>
          </button>
        </form>
      </div>
    </section>
  );
}
