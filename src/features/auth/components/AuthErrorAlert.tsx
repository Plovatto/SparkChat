import { Alert } from 'react-bootstrap';
import { FaExclamationCircle } from 'react-icons/fa';
import type { LoginThemePalette } from '../types';

interface AuthErrorAlertProps {
  message: string;
  theme: LoginThemePalette;
  marginBottom: string;
}

export function AuthErrorAlert({ message, theme, marginBottom }: AuthErrorAlertProps) {
  return (
    <Alert
      variant="danger"
      className="animate__animated animate__shakeX"
      style={{
        borderRadius: '14px',
        marginBottom,
        border: 'none',
        background: theme.alertBg,
        color: theme.alertText,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 20px)',
        fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
      }}
    >
      <FaExclamationCircle size={18} style={{ flexShrink: 0 }} />
      {message}
    </Alert>
  );
}
