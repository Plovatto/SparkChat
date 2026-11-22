import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaEye, FaEyeSlash, FaTimesCircle } from 'react-icons/fa';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import { useTheme } from '@features/theme';
import type { PasswordMatchStatus } from '../lib/password-match';

interface PasswordFieldHintProps {
  length: number;
  maxLength: number;
  matchStatus?: PasswordMatchStatus;
}

export function PasswordFieldHint({ length, maxLength, matchStatus = null }: PasswordFieldHintProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const matchColor = matchStatus === 'match' ? theme.successText : theme.dangerText;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '2px', paddingLeft: '3px', paddingRight: '4px' }}
    >
      <small
        style={{
          margin: 0,
          fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
          color: matchStatus ? matchColor : 'transparent',
          fontWeight: 600,
        }}
      >
        {matchStatus === 'match' ? t('auth.passwordsMatch') : matchStatus === 'mismatch' ? t('auth.passwordsMismatch') : ''}
      </small>
      <small style={{ margin: 0, fontSize: '0.78rem', color: theme.textMuted, fontWeight: 600 }}>
        {length}/{maxLength}
      </small>
    </div>
  );
}

const EYE_BUTTON_STYLE: CSSProperties = {
  position: 'absolute',
  right: '8px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '32px',
  height: '32px',
};

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  matchStatus?: PasswordMatchStatus;
  dense?: boolean;
  appearance?: 'default' | 'welcome';
  id?: string;
}

export function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete = 'new-password',
  matchStatus = null,
  dense = false,
  appearance = 'default',
  id,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const welcome = appearance === 'welcome';
  const toggleLabel = visible ? t('auth.hidePassword') : t('auth.showPassword');

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        data-valid={matchStatus === 'match'}
        data-invalid={matchStatus === 'mismatch'}
        className={welcome ? 'welcome-input' : 'sc-input'}
        style={
          welcome
            ? { paddingRight: matchStatus ? '76px' : '46px' }
            : {
                padding: dense ? '15px clamp(14px, 3vw, 22px)' : 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
                paddingRight: matchStatus ? '76px' : '46px',
                fontSize: dense ? '0.95rem' : 'clamp(0.95rem, 3vw, 1.15rem)',
                borderRadius: '14px',
                borderWidth: dense ? '1.5px' : '2px',
                fontWeight: 500,
              }
        }
      />
      {matchStatus && (
        <div style={{ position: 'absolute', right: '44px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
          {matchStatus === 'match' ? <FaCheckCircle size={18} color={theme.successText} /> : <FaTimesCircle size={18} color={theme.dangerText} />}
        </div>
      )}
      <button
        type="button"
        onClick={() => setVisible((previous) => !previous)}
        aria-label={toggleLabel}
        title={toggleLabel}
        className={welcome ? 'welcome-eye' : 'sc-icon-btn sc-icon-btn--ghost'}
        style={welcome ? undefined : EYE_BUTTON_STYLE}
      >
        {welcome ? visible ? <LuEyeOff size={17} /> : <LuEye size={17} /> : visible ? <FaEyeSlash size={17} /> : <FaEye size={17} />}
      </button>
    </div>
  );
}
