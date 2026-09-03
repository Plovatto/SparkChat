import type { MouseEvent } from 'react';
import { Button, Card, Container } from 'react-bootstrap';
import { FaKey, FaPlusCircle } from 'react-icons/fa';
import Logo from '@/assets/Logo.svg';
import type { LoginThemePalette } from '../types';
import { ThemeToggleButton } from './ThemeToggleButton';

interface ChooseModeCardProps {
  darkMode: boolean;
  theme: LoginThemePalette;
  onToggleTheme: () => void;
  onNewUser: () => void;
  onExistingUser: () => void;
}

export function ChooseModeCard({
  darkMode,
  theme,
  onToggleTheme,
  onNewUser,
  onExistingUser,
}: ChooseModeCardProps) {
  const handlePrimaryEnter = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.transform = 'translateY(-3px)';
    event.currentTarget.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.35)';
  };

  const handlePrimaryLeave = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.transform = 'translateY(0)';
    event.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.25)';
  };

  const handleOutlineEnter = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.borderColor = '#667eea';
    event.currentTarget.style.color = '#667eea';
    event.currentTarget.style.transform = 'translateY(-3px)';
    event.currentTarget.style.boxShadow = darkMode
      ? '0 8px 20px rgba(102, 126, 234, 0.3)'
      : '0 8px 20px rgba(102, 126, 234, 0.15)';
    event.currentTarget.style.background = darkMode ? 'rgba(102, 126, 234, 0.1)' : '#f7fafc';
  };

  const handleOutlineLeave = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.borderColor = theme.buttonOutlineBorder;
    event.currentTarget.style.color = theme.buttonOutlineText;
    event.currentTarget.style.transform = 'translateY(0)';
    event.currentTarget.style.boxShadow = darkMode
      ? '0 4px 12px rgba(0,0,0,0.2)'
      : '0 4px 12px rgba(0,0,0,0.05)';
    event.currentTarget.style.background = theme.buttonOutlineBg;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(0, 5vw, 20px)',
        position: 'relative',
      }}
    >
      <Container
        data-aos="zoom-in"
        data-aos-duration="800"
        className="animate__animated animate__fadeIn auth-container"
        style={{ maxWidth: '450px' }}
      >
        <Card
          className="hover-lift"
          style={{
            borderRadius: '28px',
            border: darkMode ? `1px solid ${theme.cardBorder}` : 'none',
            background: theme.cardBg,
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            position: 'relative',
          }}
        >
          <ThemeToggleButton darkMode={darkMode} theme={theme} onToggle={onToggleTheme} top="10px" right="10px" />

          <div
            style={{
              background: 'linear-gradient(135deg, #566fe2ff 0%, #733baaff 100%)',
              padding: 'clamp(80px, 8vw, 50px)',
              textAlign: 'center',
              color: 'white',
              position: 'relative',
            }}
          >
            <div className="auth-shimmer-overlay" />

            <div
              className="float-soft"
              style={{
                fontSize: 'clamp(2.5rem, 8vw, 4rem)',
                marginBottom: 'clamp(0px, 3vw, 20px)',
                position: 'relative',
                display: 'inline-block',
              }}
            >
              <img src={Logo} alt="Logo" style={{ width: '8.5rem', marginBottom: '-12px' }} />
            </div>

            <h1
              data-aos="zoom-in"
              data-aos-delay="200"
              style={{
                fontSize: 'clamp(2rem, 5vw, 2.8rem)',
                marginBottom: 'clamp(8px, 2vw, 10px)',
                fontWeight: 800,
                textShadow: '0 2px 20px rgba(0,0,0,0.2)',
                color: 'white',
                position: 'relative',
                letterSpacing: '-0.5px',
              }}
            >
              SparkChat
            </h1>

            <p
              data-aos="fade-up"
              data-aos-delay="300"
              style={{
                fontSize: 'clamp(0.95rem, 3vw, 1.10rem)',
                opacity: 0.95,
                fontWeight: 300,
                margin: 0,
                position: 'relative',
                maxWidth: '100%',
                color: 'white',
              }}
            >
              Onde as conversas ganham energia
            </p>
          </div>

          <Card.Body style={{ padding: 'clamp(45px, 6vw, 45px)', background: theme.cardBg }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 3vw, 16px)' }}>
              <Button
                onClick={onNewUser}
                data-aos="fade-up"
                data-aos-duration="500"
                data-aos-delay="100"
                className="smooth-transition"
                style={{
                  width: '100%',
                  padding: 'clamp(16px, 3vw, 20px)',
                  fontSize: 'clamp(1rem, 3vw, 1.15rem)',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  boxShadow: '0 8px 20px rgba(102, 126, 234, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'clamp(8px, 2vw, 10px)',
                }}
                onMouseEnter={handlePrimaryEnter}
                onMouseLeave={handlePrimaryLeave}
              >
                <FaPlusCircle size={20} />
                <span>Criar Nova Conta</span>
              </Button>

              <Button
                onClick={onExistingUser}
                data-aos="fade-up"
                data-aos-duration="500"
                data-aos-delay="200"
                className="smooth-transition"
                variant="outline-secondary"
                style={{
                  width: '100%',
                  padding: 'clamp(16px, 3vw, 20px)',
                  fontSize: 'clamp(1rem, 3vw, 1.15rem)',
                  fontWeight: 700,
                  borderRadius: '16px',
                  border: `2px solid ${theme.buttonOutlineBorder}`,
                  background: theme.buttonOutlineBg,
                  color: theme.buttonOutlineText,
                  boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'clamp(8px, 2vw, 10px)',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={handleOutlineEnter}
                onMouseLeave={handleOutlineLeave}
              >
                <FaKey size={20} />
                <span>Já tenho conta</span>
              </Button>
            </div>

            <div
              style={{
                textAlign: 'center',
                fontSize: 'clamp(0.85rem, 2vw, 0.9rem)',
                color: theme.textSecondary,
                marginTop: 'clamp(20px, 4vw, 28px)',
                fontWeight: 400,
              }}
            >
              Escolha como deseja entrar
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
