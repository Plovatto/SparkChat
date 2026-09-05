import { FaExclamationCircle } from 'react-icons/fa';

interface AuthErrorAlertProps {
  message: string;
  marginBottom: string;
}

export function AuthErrorAlert({ message, marginBottom }: AuthErrorAlertProps) {
  return (
    <div
      role="alert"
      className="sc-notice sc-notice--danger animate__animated animate__shakeX"
      style={{
        borderRadius: '14px',
        marginBottom,
        fontWeight: 500,
        alignItems: 'center',
        padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 20px)',
        fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
      }}
    >
      <FaExclamationCircle size={18} style={{ flexShrink: 0 }} />
      {message}
    </div>
  );
}
