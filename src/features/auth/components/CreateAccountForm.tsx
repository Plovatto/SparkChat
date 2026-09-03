import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Form } from 'react-bootstrap';
import { FaArrowLeft, FaCheckCircle, FaExclamationCircle, FaLock, FaPalette, FaPencilAlt, FaTimesCircle } from 'react-icons/fa';
import { Spinner } from '@components/common/Spinner';
import { useAutoDismiss } from '@lib/use-auto-dismiss';
import { AVATARS } from '../constants/avatars';
import { useNicknameAvailability } from '../hooks/useNicknameAvailability';
import { useResponsiveAvatarSize } from '../hooks/useResponsiveAvatarSize';
import { getPasswordMatchStatus } from '../lib/password-match';
import type { LoginThemePalette, PendingRegistration } from '../types';
import { AutofillDecoyFields } from './AutofillDecoyFields';
import { PasswordField, PasswordFieldHint } from './PasswordField';
import { ThemeToggleButton } from './ThemeToggleButton';

interface CreateAccountFormProps {
  darkMode: boolean;
  theme: LoginThemePalette;
  onToggleTheme: () => void;
  onBack: () => void;
  onSubmit: (input: PendingRegistration) => void;
  registerError?: string;
}

const NICKNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 12;

const NICKNAME_STATUS_TEXT: Record<'checking' | 'available' | 'taken' | 'invalid', string> = {
  checking: 'Verificando...',
  available: 'Disponível!',
  taken: 'Esse username já está em uso.',
  invalid: 'Precisa ter pelo menos 2 letras.',
};

const NICKNAME_STATUS_COLOR: Record<'checking' | 'available' | 'taken' | 'invalid', string> = {
  checking: '#a0a0a0',
  available: '#22c55e',
  taken: '#ef4444',
  invalid: '#ef4444',
};

function sanitizeNicknameInput(value: string): string {
  return value.replace(/[^\p{L}\p{N}]/gu, '');
}

export function CreateAccountForm({ darkMode, theme, onToggleTheme, onBack, onSubmit, registerError }: CreateAccountFormProps) {
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);

  useEffect(() => {
    if (registerError) {
      setError(registerError);
    }
  }, [registerError]);
  const [hoveredAvatar, setHoveredAvatar] = useState<number | null>(null);

  const nicknameStatus = useNicknameAvailability(nickname);
  const { avatarSize, iconSize } = useResponsiveAvatarSize();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!nickname.trim()) {
      setError('Por favor, digite um username!');
      return;
    }

    if (nicknameStatus !== 'available') {
      setError('Escolha um username válido e disponível!');
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres!`);
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem!');
      return;
    }

    onSubmit({ nickname: nickname.trim(), avatar: selectedAvatar, password });
  };

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div
        className="animate__animated animate__fadeIn auth-container--form"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: '600px',
        }}
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
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '94vh',
          }}
        >
          <ThemeToggleButton darkMode={darkMode} theme={theme} onToggle={onToggleTheme} top="15px" right="15px" />

          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: 'clamp(28px, 4vw, 32px) clamp(25px, 5vw, 32px)',
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
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                event.currentTarget.style.transform = 'translateX(-3px)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                event.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <FaArrowLeft size={18} />
            </Button>
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
                Criar Conta
              </h2>
              <p style={{ margin: '5px 0 0 10px', opacity: 0.95, fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', fontWeight: 300 }}>
                Escolha seu avatar e username
              </p>
            </div>
          </div>

          <Card.Body
            style={{
              padding: 'clamp(25px, 5vw, 32px)',
              background: theme.cardBg,
              overflowY: 'auto',
              flex: '0 1 auto',
              minHeight: 0,
              scrollbarGutter: 'stable both-edges',
            }}
          >
            <Form onSubmit={handleSubmit} autoComplete="off">
              <AutofillDecoyFields />
              <Form.Group style={{ marginBottom: '24px' }}>
                <Form.Label
                  style={{
                    fontWeight: 700,
                    fontSize: 'clamp(0.95rem, 3vw, 1.05rem)',
                    marginBottom: '15px',
                    color: theme.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <FaPalette size={18} />
                  Escolha seu Avatar
                </Form.Label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, ${avatarSize}px)`,
                    justifyContent: 'center',
                    columnGap: '8px',
                    rowGap: 'clamp(15px, 3vw, 22px)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    scrollbarGutter: 'stable both-edges',
                    padding: '16px',
                    background: theme.avatarGridBg,
                    borderRadius: '18px',
                    border: `1px solid ${theme.avatarBorder}`,
                  }}
                >
                  {AVATARS.map((avatar, index) => {
                    const IconComponent = avatar.icon;
                    const isSelected = selectedAvatar === index;
                    const isHovered = hoveredAvatar === index;

                    return (
                      <div
                        key={avatar.name}
                        className="smooth-transition"
                        onClick={() => setSelectedAvatar(index)}
                        style={{
                          width: `${avatarSize}px`,
                          height: `${avatarSize}px`,
                          borderRadius: '16px',
                          background: isSelected || isHovered ? avatar.bgGradient : darkMode ? '#2d3748' : 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          border: isSelected ? `3px solid ${avatar.color}` : `2px solid ${theme.avatarBorder}`,
                          boxShadow: isSelected
                            ? `0 8px 25px ${avatar.color}35`
                            : isHovered
                              ? `0 4px 15px ${avatar.color}25`
                              : darkMode
                                ? '0 2px 8px rgba(0,0,0,0.3)'
                                : '0 2px 8px rgba(0,0,0,0.06)',
                          transform: isSelected ? 'scale(1.08)' : isHovered ? 'scale(1.05)' : 'scale(1)',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'all 0.3s ease',
                        }}
                        onMouseEnter={() => setHoveredAvatar(index)}
                        onMouseLeave={() => setHoveredAvatar(null)}
                      >
                        <IconComponent
                          size={iconSize}
                          color={isSelected || isHovered ? 'white' : avatar.color}
                          style={{
                            filter: isSelected || isHovered ? 'drop-shadow(0 0 4px rgba(255,255,255,0.8))' : 'none',
                            transition: 'all 0.3s ease',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </Form.Group>

              <Form.Group style={{ marginBottom: nicknameStatus === 'idle' ? '4px' : '18px' }}>
                <Form.Label
                  style={{
                    fontWeight: 700,
                    fontSize: 'clamp(0.95rem, 3vw, 1.05rem)',
                    color: theme.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <FaPencilAlt size={18} />
                  Username
                </Form.Label>
                <div style={{ position: 'relative' }}>
                  <Form.Control
                    type="text"
                    placeholder="Digite um username..."
                    value={nickname}
                    onChange={(event) => setNickname(sanitizeNicknameInput(event.target.value))}
                    maxLength={NICKNAME_MAX_LENGTH}
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    name="sparkchat-field-a"
                    className="smooth-transition"
                    style={{
                      padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
                      paddingRight: '46px',
                      fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
                      borderRadius: '14px',
                      border: `2px solid ${theme.inputBorder}`,
                      fontWeight: 500,
                      background: theme.inputBg,
                      color: theme.inputText,
                      marginBottom: '2px',
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
                  {nickname.trim().length > 0 && (
                    <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                      {nicknameStatus === 'checking' && <Spinner size={16} accentColor="#667eea" />}
                      {nicknameStatus === 'available' && <FaCheckCircle size={18} color="#22c55e" />}
                      {(nicknameStatus === 'taken' || nicknameStatus === 'invalid') && <FaTimesCircle size={18} color="#ef4444" />}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '2px', paddingLeft: '3px', paddingRight: '4px' }}>
                  <Form.Text
                    style={{
                      margin: 0,
                      fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
                      color: nicknameStatus === 'idle' ? 'transparent' : NICKNAME_STATUS_COLOR[nicknameStatus],
                      fontWeight: 600,
                    }}
                  >
                    {nicknameStatus === 'idle' ? '' : NICKNAME_STATUS_TEXT[nicknameStatus]}
                  </Form.Text>
                  <Form.Text style={{ margin: 0, fontSize: '0.78rem', color: theme.textSecondary, fontWeight: 600, opacity: 0.85 }}>
                    {nickname.length}/{NICKNAME_MAX_LENGTH}
                  </Form.Text>
                </div>
              </Form.Group>

              <Form.Group style={{ marginBottom: password ? '2px' : '30px' }}>
                <Form.Label
                  style={{
                    fontWeight: 700,
                    fontSize: 'clamp(0.95rem, 3vw, 1.05rem)',
                    color: theme.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <FaLock size={16} />
                  Senha
                </Form.Label>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  placeholder="Digite sua senha"
                  theme={theme}
                />
                <PasswordFieldHint length={password.length} maxLength={PASSWORD_MIN_LENGTH} textSecondary={theme.textSecondary} />
              </Form.Group>

              {password.length > 0 && (
                <Form.Group
                  style={{ marginBottom: '30px' }}
                  className="animate__animated animate__fadeIn animate__faster"
                >
                  <Form.Label
                    style={{
                      fontWeight: 700,
                      fontSize: 'clamp(0.95rem, 3vw, 1.05rem)',
                      color: theme.text,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <FaLock size={16} />
                    Confirmar senha
                  </Form.Label>
                  <PasswordField
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Digite a senha novamente"
                    theme={theme}
                    matchStatus={getPasswordMatchStatus(confirmPassword, password)}
                  />
                  <PasswordFieldHint
                    length={confirmPassword.length}
                    maxLength={PASSWORD_MIN_LENGTH}
                    textSecondary={theme.textSecondary}
                    matchStatus={getPasswordMatchStatus(confirmPassword, password)}
                  />
                </Form.Group>
              )}

              {error && (
                <Alert
                  variant="danger"
                  className="animate__animated animate__shakeX"
                  style={{
                    borderRadius: '14px',
                    marginBottom: '20px',
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

              <Button
                type="submit"
                className="smooth-transition"
                style={{
                  width: '100%',
                  padding: 'clamp(14px, 3vw, 18px)',
                  fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  boxShadow: '0 8px 20px rgba(102, 126, 234, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'clamp(8px, 2vw, 10px)',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = 'translateY(-2px)';
                  event.currentTarget.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.35)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = 'translateY(0)';
                  event.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.25)';
                }}
              >
                <FaCheckCircle size={18} />
                Começar a Conversar
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
