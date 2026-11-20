import { useTranslation } from 'react-i18next';
import type { PasswordMatchStatus } from '../lib/password-match';

interface WelcomeHintProps {
  length: number;
  maxLength: number;
  matchStatus?: PasswordMatchStatus;
}

export function WelcomeHint({ length, maxLength, matchStatus = null }: WelcomeHintProps) {
  const { t } = useTranslation();
  const message = matchStatus === 'match' ? t('auth.passwordsMatch') : matchStatus === 'mismatch' ? t('auth.passwordsMismatch') : '';

  return (
    <div className="welcome-hint" aria-live="polite">
      <span key={matchStatus ?? 'none'} className="welcome-hint__status" data-status={matchStatus ?? undefined}>
        {message}
      </span>
      <span className="welcome-hint__count">
        {length}/{maxLength}
      </span>
    </div>
  );
}
