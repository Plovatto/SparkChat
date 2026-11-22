import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaKey } from 'react-icons/fa';
import { LuFileKey, LuLock, LuUser } from 'react-icons/lu';
import { Spinner } from '@components/common/Spinner';
import { withAlpha, type ThemeTokens } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { translateError } from '@lib/api/api-error';
import { useOnLanguageChange } from '@lib/i18n/app-i18n';
import { loginWithPassword, loginWithRecoveryFile } from '../lib/login-flows';
import type { PendingE2eCredential, User } from '../types';
import { AuthErrorAlert } from './AuthErrorAlert';
import { AutofillDecoyFields } from './AutofillDecoyFields';
import { PasswordField } from './PasswordField';
import { stagger } from './welcome-stagger';
import { WelcomeFormHero } from './WelcomeControls';

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
      const { user, credential } = await loginWithPassword(nickname.trim(), password);
      onSubmit(user, credential);
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
      const { user, credential } = await loginWithRecoveryFile(file);
      onSubmit(user, credential);
    } catch (err) {
      setError(translateError(err, 'errors.connection'));
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setUseKeyfile((previous) => !previous);
    setError('');
  };

  return (
    <section className="welcome-card welcome-card--form welcome-card--login" aria-labelledby="login-title">
      <WelcomeFormHero
        darkMode={darkMode}
        onToggleTheme={onToggleTheme}
        onBack={onBack}
        titleId="login-title"
        title={t('auth.login.title')}
        subtitle={useKeyfile ? t('auth.login.withKeyfile') : t('auth.login.withPassword')}
        showLogo
      />

      <div className="welcome-body welcome-body--form">
        {error && <AuthErrorAlert key={error} message={error} marginBottom="18px" />}

        {!useKeyfile ? (
          <form key="password" className="welcome-form" onSubmit={(event) => void handlePasswordSubmit(event)} autoComplete="off">
            <AutofillDecoyFields />
            <div className="welcome-field-group" style={stagger(0)}>
              <label className="welcome-label" htmlFor="login-username">
                <LuUser size={15} aria-hidden="true" />
                {t('auth.login.username')}
              </label>
              <input
                id="login-username"
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
                className="welcome-input"
              />
            </div>

            <div className="welcome-field-group welcome-field-group--last" style={stagger(1)}>
              <label className="welcome-label" htmlFor="login-password">
                <LuLock size={15} aria-hidden="true" />
                {t('auth.login.password')}
              </label>
              <PasswordField
                id="login-password"
                appearance="welcome"
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  setError('');
                }}
                placeholder={t('auth.login.passwordPlaceholder')}
              />
            </div>

            <SubmitButton isLoading={isLoading} theme={theme} />
          </form>
        ) : (
          <form key="keyfile" className="welcome-form" onSubmit={(event) => void handleKeyfileSubmit(event)}>
            <div className="welcome-field-group welcome-field-group--last" style={stagger(0)}>
              <label className="welcome-label" htmlFor="login-keyfile">
                <LuFileKey size={15} aria-hidden="true" />
                {t('auth.login.keyfile')}
              </label>
              <input
                id="login-keyfile"
                ref={fileInputRef}
                type="file"
                accept=".sparkkey"
                onChange={() => setError('')}
                className="welcome-input welcome-input--file"
              />
            </div>

            <SubmitButton isLoading={isLoading} theme={theme} />
          </form>
        )}

        <div className="welcome-divider" style={stagger(3)}>
          <span>{t('auth.welcome.or')}</span>
        </div>

        <button type="button" onClick={toggleMode} className="welcome-cta welcome-cta--ghost" style={stagger(4)}>
          {useKeyfile ? <LuUser size={15} aria-hidden="true" /> : <FaKey size={14} aria-hidden="true" className="welcome-cta__key" />}
          <span>{useKeyfile ? t('auth.login.switchToPassword') : t('auth.login.switchToKeyfile')}</span>
        </button>
      </div>
    </section>
  );
}

function SubmitButton({ isLoading, theme }: { isLoading: boolean; theme: ThemeTokens }) {
  const { t } = useTranslation();

  return (
    <button
      type="submit"
      disabled={isLoading}
      className="welcome-cta welcome-cta--primary welcome-cta--submit"
      style={{ ...stagger(2), cursor: isLoading ? 'wait' : undefined }}
    >
      {isLoading ? (
        <Spinner size={18} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} />
      ) : (
        <FaCheckCircle size={17} aria-hidden="true" />
      )}
      <span>{isLoading ? t('auth.login.submitting') : t('auth.login.submit')}</span>
    </button>
  );
}
