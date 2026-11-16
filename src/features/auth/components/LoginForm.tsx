import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Card, Container, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaFileUpload, FaKey, FaLock, FaUser } from 'react-icons/fa';
import { Spinner } from '@components/common/Spinner';
import { withAlpha, type ThemeTokens } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { translateError } from '@lib/api/api-error';
import { useOnLanguageChange } from '@lib/i18n/app-i18n';
import { login, loginWithKeyfile } from '../api/auth-api';
import type { PendingE2eCredential, User } from '../types';
import { AuthBackButton } from './AuthBackButton';
import { AuthErrorAlert } from './AuthErrorAlert';
import { AUTH_HEADER_CONTROLS_SPACE, AuthLanguageSwitch } from './AuthLanguageSwitch';
import { AutofillDecoyFields } from './AutofillDecoyFields';
import { PasswordField } from './PasswordField';
import { ThemeToggleButton } from './ThemeToggleButton';

interface LoginFormProps {
  darkMode: boolean;
  theme: ThemeTokens;
  onToggleTheme: () => void;
  onBack: () => void;
  onSubmit: (user: User, e2eCredential?: PendingE2eCredential) => void;
}

export function LoginForm({ darkMode, theme, onToggleTheme, onBack, onSubmit }: LoginFormProps) {
  const { t } = useTranslation();
  const [useKeyfile, setUseKeyfile] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useOnLanguageChange(() => setError(''));
  useAutoDismiss(error, setError);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!nickname.trim() || !password) {
      setError(t('auth.login.fillFields'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const user = await login({ nickname: nickname.trim(), password });
      onSubmit(user, { type: 'password', password });
    } catch (err) {
      setError(translateError(err, 'errors.connection'));
      setIsLoading(false);
    }
  };

  const handleKeyfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError(t('auth.login.selectKeyfile'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { user, recoveryToken } = await loginWithKeyfile(file);
      onSubmit(user, { type: 'keyfile', recoveryToken });
    } catch (err) {
      setError(translateError(err, 'errors.connection'));
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setUseKeyfile((previous) => !previous);
    setError('');
  };

  const labelStyle: CSSProperties = {
    fontWeight: 700,
    fontSize: 'clamp(0.95rem, 3vw, 1.05rem)',
    color: theme.textPrimary,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const inputStyle: CSSProperties = {
    padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
    fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
    borderRadius: '14px',
    borderWidth: '2px',
    fontWeight: 500,
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
      <Container
        className="sc-anim-hero-in auth-container--form"
        style={{ maxWidth: '540px', margin: 0 }}
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
            position: 'relative',
          }}
        >
          <AuthLanguageSwitch top="15px" right="15px" />
          <ThemeToggleButton darkMode={darkMode} onToggle={onToggleTheme} top="15px" right="15px" />

          <div
            className="auth-form-header"
            style={{
              background: theme.gradient,
              padding: 'clamp(35px, 4vw, 35px) clamp(0px, 5vw, 45px)',
              paddingRight: AUTH_HEADER_CONTROLS_SPACE,
              color: theme.onGradient,
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(12px, 3vw, 18px)',
            }}
          >
            <AuthBackButton onClick={onBack} />
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: '0 0 0 8px', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center' }}>
                {t('auth.login.title')}
              </h2>
              <p style={{ margin: '4px 0 0 8px', color: theme.onGradientMuted, fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', fontWeight: 300 }}>
                {useKeyfile ? t('auth.login.withKeyfile') : t('auth.login.withPassword')}
              </p>
            </div>
          </div>

          <Card.Body style={{ padding: 'clamp(50px, 5vw, 45px) clamp(25px, 5vw, 45px)', background: theme.surfaceElevated }}>
            {error && <AuthErrorAlert key={error} message={error} marginBottom="25px" />}

            {!useKeyfile ? (
              <Form onSubmit={(event) => void handlePasswordSubmit(event)} autoComplete="off">
                <AutofillDecoyFields />
                <Form.Group style={{ marginBottom: '10px' }}>
                  <Form.Label style={labelStyle}>
                    <FaUser size={16} />
                    {t('auth.login.username')}
                  </Form.Label>
                  <input
                    type="text"
                    placeholder={t('auth.login.usernamePlaceholder')}
                    value={nickname}
                    onChange={(event) => {
                      setNickname(event.target.value);
                      setError('');
                    }}
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    name="sparkchat-field-a"
                    className="sc-input"
                    style={inputStyle}
                  />
                </Form.Group>

                <Form.Group style={{ marginBottom: '30px' }}>
                  <Form.Label style={labelStyle}>
                    <FaLock size={16} />
                    {t('auth.login.password')}
                  </Form.Label>
                  <PasswordField
                    value={password}
                    onChange={(value) => {
                      setPassword(value);
                      setError('');
                    }}
                    placeholder={t('auth.login.passwordPlaceholder')}
                  />
                </Form.Group>

                <SubmitButton isLoading={isLoading} theme={theme} />
              </Form>
            ) : (
              <Form onSubmit={(event) => void handleKeyfileSubmit(event)}>
                <Form.Group style={{ marginBottom: '30px' }}>
                  <Form.Label style={labelStyle}>
                    <FaFileUpload size={16} />
                    {t('auth.login.keyfile')}
                  </Form.Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sparkkey"
                    onChange={() => setError('')}
                    className="sc-input sc-input--file"
                    style={{ ...inputStyle, fontSize: 'clamp(0.85rem, 2.5vw, 1rem)' }}
                  />
                </Form.Group>

                <SubmitButton isLoading={isLoading} theme={theme} />
              </Form>
            )}

            <button
              type="button"
              onClick={toggleMode}
              className="sc-btn sc-btn--secondary"
              style={{
                marginTop: '25px',
                width: '100%',
                padding: 'clamp(14px, 3vw, 18px)',
                borderRadius: '14px',
                gap: '10px',
                whiteSpace: 'normal',
                fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
                lineHeight: 1.4,
              }}
            >
              <FaKey size={15} style={{ flexShrink: 0 }} />
              <span>{useKeyfile ? t('auth.login.switchToPassword') : t('auth.login.switchToKeyfile')}</span>
            </button>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}

function SubmitButton({ isLoading, theme }: { isLoading: boolean; theme: ThemeTokens }) {
  const { t } = useTranslation();

  return (
    <button
      type="submit"
      disabled={isLoading}
      className="sc-btn sc-btn--gradient sc-btn--lift"
      style={{
        width: '100%',
        padding: 'clamp(14px, 3vw, 18px)',
        fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
        fontWeight: 700,
        borderRadius: '14px',
        gap: 'clamp(8px, 2vw, 10px)',
        cursor: isLoading ? 'wait' : undefined,
      }}
    >
      {isLoading ? (
        <>
          <Spinner size={18} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} />
          <span>{t('auth.login.submitting')}</span>
        </>
      ) : (
        <>
          <FaCheckCircle size={18} />
          <span>{t('auth.login.submit')}</span>
        </>
      )}
    </button>
  );
}
