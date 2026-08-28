import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Container, Form } from 'react-bootstrap';
import { FaArrowLeft, FaCheckCircle, FaExclamationCircle, FaKey, FaLightbulb } from 'react-icons/fa';
import { validateLoginCode } from '../api/auth-api';
import type { LoginThemePalette, User } from '../types';
import { ThemeToggleButton } from './ThemeToggleButton';

interface ExistingCodeFormProps {
  darkMode: boolean;
  theme: LoginThemePalette;
  onToggleTheme: () => void;
  onBack: () => void;
  onSubmit: (user: User) => void;
}

export function ExistingCodeForm({ darkMode, theme, onToggleTheme, onBack, onSubmit }: ExistingCodeFormProps) {
  const [loginCode, setLoginCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCode = loginCode.trim();

    if (!trimmedCode) {
      setError('Por favor, digite seu código de login!');
      return;
    }

    if (!/^\d{6}$/.test(trimmedCode)) {
      setError('Código de login deve ter 6 dígitos numéricos!');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const user = await validateLoginCode(trimmedCode);
      onSubmit({ ...user, loginCode: trimmedCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar com o servidor. Tente novamente!');
      setIsLoading(false);
    }
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
                Entre com seu código
              </p>
            </div>
          </div>

          <Card.Body style={{ padding: 'clamp(50px, 5vw, 45px) clamp(25px, 5vw, 45px)', background: theme.cardBg }}>
            <Form onSubmit={(event) => void handleSubmit(event)}>
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

              <Form.Group style={{ marginBottom: '30px' }}>
                <Form.Label
                  style={{
                    fontWeight: 700,
                    fontSize: 'clamp(0.95rem, 3vw, 1.05rem)',
                    color: theme.text,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <FaKey size={16} />
                  Código de Login
                </Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Digite seu código"
                  value={loginCode}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, '').slice(0, 6);
                    setLoginCode(value);
                    setError('');
                  }}
                  maxLength={6}
                  inputMode="numeric"
                  className="smooth-transition auth-input-code"
                  style={{
                    padding: 'clamp(20px, 1vw, 12px)',
                    fontSize: 'clamp(0.9rem, 3vw, 1.5rem)',
                    borderRadius: '14px',
                    border: `2px solid ${theme.inputBorder}`,
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    marginBottom: '4px',
                    fontWeight: 700,
                    background: theme.inputBg,
                    color: theme.inputText,
                    lineHeight: '1.2',
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

                <Form.Text style={{ fontSize: 'clamp(0.7rem, 2vw, 0.8rem)', color: theme.textSecondary, fontWeight: 500, marginLeft: '4px' }}>
                  Código único de 6 dígitos
                </Form.Text>
              </Form.Group>

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
                  marginBottom: '25px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'clamp(8px, 2vw, 10px)',
                  cursor: isLoading ? 'wait' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                }}
                onMouseEnter={(event) => {
                  if (isLoading) return;
                  event.currentTarget.style.transform = 'translateY(-2px)';
                  event.currentTarget.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.35)';
                }}
                onMouseLeave={(event) => {
                  if (isLoading) return;
                  event.currentTarget.style.transform = 'translateY(0)';
                  event.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.25)';
                }}
              >
                {isLoading ? (
                  <>
                    <div className="auth-spinner" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%' }} />
                    <span>Validando...</span>
                  </>
                ) : (
                  <>
                    <FaCheckCircle size={18} />
                    <span>Entrar</span>
                  </>
                )}
              </Button>

              <div
                data-aos="fade-up"
                data-aos-delay="200"
                style={{
                  padding: 'clamp(16px, 3vw, 22px)',
                  background: theme.infoBg,
                  borderRadius: '14px',
                  textAlign: 'center',
                  border: `1px solid ${theme.infoBorder}`,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 'clamp(0.50rem, 2.5vw, 0.95rem)',
                    color: theme.infoText,
                    lineHeight: '1.6',
                    fontWeight: 500,
                    display: 'flex',
                    textAlign: 'start',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <FaLightbulb size={16} style={{ flexShrink: 0, marginRight: '14px' }} />
                  <span>
                    <strong>Dica:</strong> Salve seu código de login! Ele carrega todas as suas configurações anteriores
                  </span>
                </p>
              </div>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
