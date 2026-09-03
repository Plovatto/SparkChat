import { useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Container, Form } from 'react-bootstrap';
import { FaArrowLeft, FaCheckCircle, FaExclamationCircle, FaFileUpload, FaKey, FaLock, FaUser } from 'react-icons/fa';
import { useAutoDismiss } from '@lib/use-auto-dismiss';
import { login, loginWithKeyfile } from '../api/auth-api';
import type { LoginThemePalette, User } from '../types';
import { AutofillDecoyFields } from './AutofillDecoyFields';
import { PasswordField } from './PasswordField';
import { ThemeToggleButton } from './ThemeToggleButton';

interface LoginFormProps {
  darkMode: boolean;
  theme: LoginThemePalette;
  onToggleTheme: () => void;
  onBack: () => void;
  onSubmit: (user: User) => void;
}

export function LoginForm({ darkMode, theme, onToggleTheme, onBack, onSubmit }: LoginFormProps) {
  const [useKeyfile, setUseKeyfile] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!nickname.trim() || !password) {
      setError('Preencha o username e a senha!');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const user = await login({ nickname: nickname.trim(), password });
      onSubmit(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar com o servidor. Tente novamente!');
      setIsLoading(false);
    }
  };

  const handleKeyfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Selecione o seu arquivo de recuperação!');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const user = await loginWithKeyfile(file);
      onSubmit(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar com o servidor. Tente novamente!');
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setUseKeyfile((previous) => !previous);
    setError('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(0px, 10px, 20px)',
        position: 'relative',
      }}
    >
      <Container
        data-aos="fade-up"
        data-aos-duration="500"
        className="animate__animated animate__fadeIn auth-container--form"
        style={{ maxWidth: '540px', margin: 0 }}
      >
        <Card
          className="hover-lift"
          style={{
            borderRadius: '28px',
            boxShadow: darkMode
              ? '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 1px rgba(102, 126, 234, 0.2)'
              : '0 20px 60px rgba(102, 126, 234, 0.15), 0 0 1px rgba(0,0,0,0.1)',
            border: darkMode ? `1px solid ${theme.cardBorder}` : 'none',
            background: theme.cardBg,
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            position: 'relative',
          }}
        >
          <ThemeToggleButton darkMode={darkMode} theme={theme} onToggle={onToggleTheme} top="15px" right="15px" />

          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: 'clamp(35px, 4vw, 35px) clamp(0px, 5vw, 45px)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(12px, 3vw, 18px)',
            }}
          >
            <Button
              onClick={onBack}
              className="smooth-transition"
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 12px',
                color: 'white',
                backdropFilter: 'blur(10px)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                e.currentTarget.style.transform = 'translateX(-3px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <FaArrowLeft size={18} />
            </Button>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: '0 0 0 8px', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center' }}>
                Bem-vindo de volta!
              </h2>
              <p style={{ margin: '4px 0 0 8px', opacity: 0.95, fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', fontWeight: 300 }}>
                {useKeyfile ? 'Entre com seu arquivo de recuperação' : 'Entre com username e senha'}
              </p>
            </div>
          </div>

          <Card.Body style={{ padding: 'clamp(50px, 5vw, 45px) clamp(25px, 5vw, 45px)', background: theme.cardBg }}>
            {error && (
              <Alert
                variant="danger"
                className="animate__animated animate__shakeX"
                style={{
                  borderRadius: '14px',
                  marginBottom: '25px',
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
                {error}
              </Alert>
            )}

            {!useKeyfile ? (
              <Form onSubmit={(event) => void handlePasswordSubmit(event)} autoComplete="off">
                <AutofillDecoyFields />
                <Form.Group style={{ marginBottom: '20px' }}>
                  <Form.Label style={{ fontWeight: 700, fontSize: 'clamp(0.95rem, 3vw, 1.05rem)', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaUser size={16} />
                    Username
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Seu username"
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
                    className="smooth-transition"
                    style={{
                      padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
                      fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
                      borderRadius: '14px',
                      border: `2px solid ${theme.inputBorder}`,
                      fontWeight: 500,
                      background: theme.inputBg,
                      color: theme.inputText,
                    }}
                  />
                </Form.Group>

                <Form.Group style={{ marginBottom: '30px' }}>
                  <Form.Label style={{ fontWeight: 700, fontSize: 'clamp(0.95rem, 3vw, 1.05rem)', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaLock size={16} />
                    Senha
                  </Form.Label>
                  <PasswordField
                    value={password}
                    onChange={(value) => {
                      setPassword(value);
                      setError('');
                    }}
                    placeholder="Sua senha"
                    theme={theme}
                  />
                </Form.Group>

                <SubmitButton isLoading={isLoading} />
              </Form>
            ) : (
              <Form onSubmit={(event) => void handleKeyfileSubmit(event)}>
                <Form.Group style={{ marginBottom: '30px' }}>
                  <Form.Label style={{ fontWeight: 700, fontSize: 'clamp(0.95rem, 3vw, 1.05rem)', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaFileUpload size={16} />
                    Arquivo de recuperação
                  </Form.Label>
                  <Form.Control
                    ref={fileInputRef}
                    type="file"
                    accept=".sparkkey"
                    onChange={() => setError('')}
                    className="smooth-transition"
                    style={{
                      padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
                      fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
                      borderRadius: '14px',
                      border: `2px solid ${theme.inputBorder}`,
                      background: theme.inputBg,
                      color: theme.inputText,
                    }}
                  />
                </Form.Group>

                <SubmitButton isLoading={isLoading} />
              </Form>
            )}

            <button
              type="button"
              onClick={toggleMode}
              className="smooth-transition"
              style={{
                marginTop: '25px',
                width: '100%',
                padding: 'clamp(14px, 3vw, 18px)',
                background: theme.infoBg,
                border: `1px solid ${theme.infoBorder}`,
                borderRadius: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                textAlign: 'center',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.borderColor = '#667eea';
                event.currentTarget.style.background = 'rgba(102, 126, 234, 0.08)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.borderColor = theme.infoBorder;
                event.currentTarget.style.background = theme.infoBg;
              }}
            >
              <FaKey size={15} style={{ flexShrink: 0, color: theme.infoText }} />
              <span style={{ color: theme.infoText, fontWeight: 600, fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', lineHeight: 1.4 }}>
                {useKeyfile ? 'Entrar com username e senha' : 'Entrar com o arquivo de recuperação?'}
              </span>
            </button>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  return (
    <Button
      type="submit"
      disabled={isLoading}
      className="smooth-transition"
      style={{
        width: '100%',
        padding: 'clamp(14px, 3vw, 18px)',
        fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
        fontWeight: 700,
        border: 'none',
        borderRadius: '14px',
        background: isLoading ? '#999999' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        boxShadow: isLoading ? 'none' : '0 8px 20px rgba(102, 126, 234, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'clamp(8px, 2vw, 10px)',
        cursor: isLoading ? 'wait' : 'pointer',
        opacity: isLoading ? 0.7 : 1,
      }}
    >
      {isLoading ? (
        <>
          <div className="auth-spinner" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%' }} />
          <span>Entrando...</span>
        </>
      ) : (
        <>
          <FaCheckCircle size={18} />
          <span>Entrar</span>
        </>
      )}
    </Button>
  );
}
