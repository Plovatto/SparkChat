import { useState } from 'react';
import { Form } from 'react-bootstrap';
import { FaCheckCircle, FaEye, FaEyeSlash, FaTimesCircle } from 'react-icons/fa';
import type { PasswordMatchStatus } from '../lib/password-match';

export interface PasswordFieldTheme {
  inputBorder: string;
  inputBg: string;
  inputText: string;
  textSecondary: string;
}

const MATCH_STATUS_TEXT: Record<'match' | 'mismatch', string> = {
  match: 'Senhas coincidem!',
  mismatch: 'Senhas não coincidem.',
};

const MATCH_STATUS_COLOR: Record<'match' | 'mismatch', string> = {
  match: '#22c55e',
  mismatch: '#ef4444',
};

interface PasswordFieldHintProps {
  length: number;
  maxLength: number;
  textSecondary: string;
  matchStatus?: PasswordMatchStatus;
}

export function PasswordFieldHint({ length, maxLength, textSecondary, matchStatus = null }: PasswordFieldHintProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '2px', paddingLeft: '3px', paddingRight: '4px' }}>
      <small
        style={{
          margin: 0,
          fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
          color: matchStatus ? MATCH_STATUS_COLOR[matchStatus] : 'transparent',
          fontWeight: 600,
        }}
      >
        {matchStatus ? MATCH_STATUS_TEXT[matchStatus] : ''}
      </small>
      <small style={{ margin: 0, fontSize: '0.78rem', color: textSecondary, fontWeight: 600, opacity: 0.85 }}>
        {length}/{maxLength}
      </small>
    </div>
  );
}

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  theme: PasswordFieldTheme;
  autoComplete?: string;
  matchStatus?: PasswordMatchStatus;
  dense?: boolean;
}

export function PasswordField({
  value,
  onChange,
  placeholder,
  theme,
  autoComplete = 'new-password',
  matchStatus = null,
  dense = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <Form.Control
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="smooth-transition"
        style={{
          padding: dense ? '15px clamp(14px, 3vw, 22px)' : 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
          paddingRight: matchStatus ? '76px' : '46px',
          fontSize: dense ? '0.95rem' : 'clamp(0.95rem, 3vw, 1.15rem)',
          borderRadius: '14px',
          border: `2px solid ${theme.inputBorder}`,
          fontWeight: 500,
          background: theme.inputBg,
          color: theme.inputText,
        }}
        onFocus={(event) => {
          event.currentTarget.style.borderColor = '#667eea';
          event.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
        }}
        onBlur={(event) => {
          event.currentTarget.style.borderColor = theme.inputBorder;
          event.currentTarget.style.boxShadow = 'none';
        }}
      />
      {matchStatus && (
        <div style={{ position: 'absolute', right: '44px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
          {matchStatus === 'match' ? <FaCheckCircle size={18} color="#22c55e" /> : <FaTimesCircle size={18} color="#ef4444" />}
        </div>
      )}
      <button
        type="button"
        onClick={() => setVisible((previous) => !previous)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        className="smooth-transition"
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '32px',
          height: '32px',
          background: 'transparent',
          border: 'none',
          borderRadius: '50%',
          padding: 0,
          color: theme.textSecondary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'rgba(102, 126, 234, 0.12)';
          event.currentTarget.style.color = '#667eea';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'transparent';
          event.currentTarget.style.color = theme.textSecondary;
        }}
      >
        {visible ? <FaEyeSlash size={17} /> : <FaEye size={17} />}
      </button>
    </div>
  );
}
