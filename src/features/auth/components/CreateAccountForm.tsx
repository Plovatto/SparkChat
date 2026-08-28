import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Container, Form } from 'react-bootstrap';
import { FaArrowLeft, FaCheckCircle, FaExclamationCircle, FaPalette, FaPencilAlt } from 'react-icons/fa';
import { AVATARS } from '../constants/avatars';
import type { CreateAccountInput, LoginThemePalette } from '../types';
import { ThemeToggleButton } from './ThemeToggleButton';

interface CreateAccountFormProps {
  darkMode: boolean;
  theme: LoginThemePalette;
  onToggleTheme: () => void;
  onBack: () => void;
  onSubmit: (input: CreateAccountInput) => void;
}

const NICKNAME_MAX_LENGTH = 20;

export function CreateAccountForm({ darkMode, theme, onToggleTheme, onBack, onSubmit }: CreateAccountFormProps) {
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [error, setError] = useState('');
  const [hoveredAvatar, setHoveredAvatar] = useState<number | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!nickname.trim()) {
      setError('Por favor, digite um apelido!');
      return;
    }

    if (nickname.trim().length < 2) {
      setError('O apelido deve ter pelo menos 2 caracteres!');
      return;
    }

    onSubmit({ nickname: nickname.trim(), avatar: selectedAvatar });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(0, 5vw, 10px)',
        position: 'relative',
      }}
    >
      <Container
        data-aos="fade-up"
        data-aos-duration="500"
        className="animate__animated animate__fadeIn auth-container--form"
        style={{ maxWidth: '600px' }}
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
          }}
        >
          <ThemeToggleButton darkMode={darkMode} theme={theme} onToggle={onToggleTheme} top="15px" right="15px" />

          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: 'clamp(35px, 4vw, 0px) clamp(25px, 5vw, 32px)',
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
                Escolha seu avatar e apelido
              </p>
            </div>
          </div>

          <Card.Body style={{ padding: 'clamp(25px, 5vw, 0px)', background: theme.cardBg }}>
            <Form onSubmit={handleSubmit}>
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

              <Form.Group style={{ marginBottom: '35px' }}>
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
                  data-aos="fade-up"
                  data-aos-duration="500"
                  data-aos-delay="100"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))',
                    columnGap: '8px',
                    rowGap: 'clamp(15px, 3vw, 22px)',
                    maxHeight: '250px',
                    overflowY: 'auto',
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
                        data-aos="zoom-in"
                        data-aos-duration="300"
                        data-aos-delay={index * 15}
                        className="smooth-transition"
                        onClick={() => setSelectedAvatar(index)}
                        style={{
                          marginLeft: '6px',
                          width: '75px',
                          height: '75px',
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
                          size={40}
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

              <Form.Group style={{ marginBottom: '30px' }} data-aos="fade-up" data-aos-duration="500" data-aos-delay="200">
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
                  Seu Apelido
                </Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Digite um apelido legal..."
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={NICKNAME_MAX_LENGTH}
                  className="smooth-transition"
                  style={{
                    padding: 'clamp(12px, 2vw, 16px) clamp(14px, 3vw, 22px)',
                    fontSize: 'clamp(0.95rem, 3vw, 1.15rem)',
                    borderRadius: '14px',
                    border: `2px solid ${theme.inputBorder}`,
                    fontWeight: 500,
                    background: theme.inputBg,
                    color: theme.inputText,
                    marginBottom: '5px',
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
                <Form.Text style={{ fontSize: 'clamp(0.8rem, 2vw, 0.9rem)', color: theme.textSecondary, fontWeight: 500, marginLeft: '4px' }}>
                  {nickname.length}/{NICKNAME_MAX_LENGTH} caracteres
                </Form.Text>
              </Form.Group>

              <Button
                type="submit"
                className="smooth-transition"
                data-aos="fade-up"
                data-aos-duration="500"
                data-aos-delay="300"
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
      </Container>
    </div>
  );
}
