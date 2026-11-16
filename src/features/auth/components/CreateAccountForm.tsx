import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Card, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaLock, FaPalette, FaPencilAlt, FaTimesCircle } from 'react-icons/fa';
import { Spinner } from '@components/common/Spinner';
import type { ThemeTokens } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { translate, useOnLanguageChange } from '@lib/i18n/app-i18n';
import { AVATARS } from '../constants/avatars';
import { NICKNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants/validation';
import { useNicknameAvailability, type NicknameCheckState } from '../hooks/useNicknameAvailability';
import { useResponsiveAvatarSize } from '../hooks/useResponsiveAvatarSize';
import { getPasswordMatchStatus } from '../lib/password-match';
import type { PendingRegistration } from '../types';
import { AuthBackButton } from './AuthBackButton';
import { AuthErrorAlert } from './AuthErrorAlert';
import { AUTH_HEADER_CONTROLS_SPACE, AuthLanguageSwitch } from './AuthLanguageSwitch';
import { AutofillDecoyFields } from './AutofillDecoyFields';
import { PasswordField, PasswordFieldHint } from './PasswordField';
import { ThemeToggleButton } from './ThemeToggleButton';

interface CreateAccountFormProps {
  darkMode: boolean;
  theme: ThemeTokens;
  onToggleTheme: () => void;
  onBack: () => void;
  onSubmit: (input: PendingRegistration) => void;
  registerError?: string;
}

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
  useOnLanguageChange(() => setError(''));
  useAutoDismiss(error, setError);

  useEffect(() => {
    if (registerError) {
      setError(registerError);
    }
  }, [registerError]);

  const nicknameStatus = useNicknameAvailability(nickname);
  const { avatarSize, iconSize } = useResponsiveAvatarSize();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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

    onSubmit({ nickname: nickname.trim(), avatar: selectedAvatar, password });
  };

  const nicknameStatusColor: Record<ResolvedNicknameCheckState, string> = {
    checking: theme.textMuted,
    available: theme.successText,
    taken: theme.dangerText,
    invalid: theme.dangerText,
  };

  const labelStyle: CSSProperties = {
    fontWeight: 700,
    fontSize: 'clamp(0.95rem, 3vw, 1.05rem)',
    color: theme.textPrimary,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
  };

  return (
    <div
      style={{
        minHeight: 'var(--app-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(0px, 10px, 20px)',
        position: 'relative',
      }}
    >
      <div
        className="sc-anim-hero-in auth-container--form"
        style={{
          width: '90%',
          maxWidth: '600px',
        }}
      >
        <Card
          className="hover-lift"
          style={{
            borderRadius: '28px',
            boxShadow: theme.shadowLg,
            border: `1px solid ${theme.borderSubtle}`,
            background: theme.surfaceElevated,
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '94vh',
          }}
        >
          <AuthLanguageSwitch top="15px" right="15px" />
          <ThemeToggleButton darkMode={darkMode} onToggle={onToggleTheme} top="15px" right="15px" />

          <div
            className="auth-form-header"
            style={{
              background: theme.gradient,
              padding: 'clamp(28px, 4vw, 32px) clamp(25px, 5vw, 32px)',
              paddingRight: AUTH_HEADER_CONTROLS_SPACE,
              color: theme.onGradient,
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(12px, 3vw, 18px)',
            }}
          >
            <AuthBackButton onClick={onBack} />
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  margin: '0 0 0 10px',
                  fontSize: 'clamp(1.3rem, 4vw, 1.8rem)',
                  fontWeight: 800,
                  letterSpacing: '-0.5px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {t('auth.register.title')}
              </h2>
              <p style={{ margin: '5px 0 0 10px', color: theme.onGradientMuted, fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', fontWeight: 300 }}>
                {t('auth.register.subtitle')}
              </p>
            </div>
          </div>

          <Card.Body
            style={{
              padding: 'clamp(25px, 5vw, 32px)',
              background: theme.surfaceElevated,
              overflowY: 'auto',
              flex: '0 1 auto',
              minHeight: 0,
              scrollbarGutter: 'stable both-edges',
            }}
          >
            <Form onSubmit={handleSubmit} autoComplete="off">
              <AutofillDecoyFields />
              <Form.Group style={{ marginBottom: '18px' }}>
                <Form.Label style={{ ...labelStyle, marginBottom: '10px' }}>
                  <FaPalette size={18} />
                  {t('auth.register.avatar')}
                </Form.Label>
                <div
                  className="sc-card"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                    justifyContent: 'center',
                    columnGap: 'clamp(14px, 3vw, 20px)',
                    rowGap: 'clamp(15px, 3vw, 22px)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    scrollbarGutter: 'stable both-edges',
                    padding: '16px',
                    borderRadius: '18px',
                  }}
                >
                  {AVATARS.map((avatar, index) => {
                    const IconComponent = avatar.icon;
                    const isSelected = selectedAvatar === index;

                    return (
                      <button
                        type="button"
                        key={avatar.name}
                        onClick={() => setSelectedAvatar(index)}
                        data-selected={isSelected}
                        title={translate(`avatars.${avatar.name}`)}
                        aria-label={translate(`avatars.${avatar.name}`)}
                        className={`sc-avatar-option${isSelected ? '' : ' sc-anim-tile-in sc-stagger'}`}
                        style={
                          {
                            width: '100%',
                            maxWidth: `${avatarSize}px`,
                            aspectRatio: '1 / 1',
                            justifySelf: 'center',
                            '--avatar-gradient': avatar.bgGradient,
                            '--avatar-color': avatar.color,
                            '--sc-stagger-index': Math.min(index, 11),
                            '--sc-stagger-step': '22ms',
                          } as CSSProperties
                        }
                      >
                        <IconComponent size={iconSize} />
                      </button>
                    );
                  })}
                </div>
              </Form.Group>

              <Form.Group style={{ marginBottom: nicknameStatus === 'idle' ? '0px' : '10px' }}>
                <Form.Label style={labelStyle}>
                  <FaPencilAlt size={18} />
                  {t('auth.register.username')}
                </Form.Label>
                <div style={{ position: 'relative' }}>
                  <input
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
                    className="sc-input"
                    style={{
                      padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
                      paddingRight: '46px',
                      fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
                      borderRadius: '14px',
                      borderWidth: '2px',
                      fontWeight: 500,
                      marginBottom: '2px',
                    }}
                  />
                  {nickname.trim().length > 0 && (
                    <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                      {nicknameStatus === 'checking' && <Spinner size={16} />}
                      {nicknameStatus === 'available' && <FaCheckCircle size={18} color={theme.successText} />}
                      {(nicknameStatus === 'taken' || nicknameStatus === 'invalid') && <FaTimesCircle size={18} color={theme.dangerText} />}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    marginTop: '2px',
                    paddingLeft: '3px',
                    paddingRight: '4px',
                  }}
                >
                  <Form.Text
                    style={{
                      margin: 0,
                      fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
                      color: nicknameStatus === 'idle' ? 'transparent' : nicknameStatusColor[nicknameStatus],
                      fontWeight: 600,
                    }}
                  >
                    {nicknameStatus === 'idle' ? '' : t(`auth.register.${nicknameStatus}`)}
                  </Form.Text>
                  <Form.Text style={{ margin: 0, fontSize: '0.78rem', color: theme.textMuted, fontWeight: 600 }}>
                    {nickname.length}/{NICKNAME_MAX_LENGTH}
                  </Form.Text>
                </div>
              </Form.Group>

              <Form.Group style={{ marginTop: '-4px', marginBottom: password ? '2px' : '14px' }}>
                <Form.Label style={labelStyle}>
                  <FaLock size={16} />
                  {t('auth.register.password')}
                </Form.Label>
                <PasswordField value={password} onChange={setPassword} placeholder={t('auth.register.passwordPlaceholder')} />
                <PasswordFieldHint length={password.length} maxLength={PASSWORD_MIN_LENGTH} />
              </Form.Group>

              {password.length > 0 && (
                <Form.Group style={{ marginBottom: '14px' }} className="sc-anim-rise-in">
                  <Form.Label style={labelStyle}>
                    <FaLock size={16} />
                    {t('auth.register.confirmPassword')}
                  </Form.Label>
                  <PasswordField
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder={t('auth.register.confirmPlaceholder')}
                    matchStatus={getPasswordMatchStatus(confirmPassword, password)}
                  />
                  <PasswordFieldHint
                    length={confirmPassword.length}
                    maxLength={PASSWORD_MIN_LENGTH}
                    matchStatus={getPasswordMatchStatus(confirmPassword, password)}
                  />
                </Form.Group>
              )}

              {error && <AuthErrorAlert key={error} message={error} marginBottom="20px" />}

              <button
                type="submit"
                className="sc-btn sc-btn--gradient sc-btn--lift"
                style={{
                  width: '100%',
                  padding: 'clamp(14px, 3vw, 18px)',
                  fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
                  fontWeight: 700,
                  borderRadius: '14px',
                  gap: 'clamp(8px, 2vw, 10px)',
                }}
              >
                <FaCheckCircle size={18} />
                {t('auth.register.submit')}
              </button>
            </Form>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
