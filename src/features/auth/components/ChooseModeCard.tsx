import type { CSSProperties } from 'react';
import { Card, Container } from 'react-bootstrap';
import { FaKey, FaPlusCircle } from 'react-icons/fa';
import Logo from '@/assets/Logo.svg';
import type { ThemeTokens } from '@features/theme';
import { ThemeToggleButton } from './ThemeToggleButton';

interface ChooseModeCardProps {
  darkMode: boolean;
  theme: ThemeTokens;
  onToggleTheme: () => void;
  onNewUser: () => void;
  onExistingUser: () => void;
}

export function ChooseModeCard({ darkMode, theme, onToggleTheme, onNewUser, onExistingUser }: ChooseModeCardProps) {
  const accentMid = `color-mix(in srgb, ${theme.accent} 50%, ${theme.accentText} 50%)`;

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
      <Container className="sc-anim-hero-in auth-container" style={{ maxWidth: 'clamp(400px, 90vw, 480px)' }}>
        <Card
          className="hover-lift"
          style={{
            borderRadius: '28px',
            border: `1px solid ${theme.borderSubtle}`,
            background: theme.surfaceElevated,
            boxShadow: theme.shadowLg,
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            position: 'relative',
          }}
        >
          <ThemeToggleButton darkMode={darkMode} onToggle={onToggleTheme} top="10px" right="10px" noBorder iconColor={accentMid} />

          <div
            style={{
              background: theme.gradient,
              padding: 'clamp(80px, 8vw, 50px)',
              textAlign: 'center',
              color: theme.onGradient,
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
              className="sc-anim-rise-in sc-stagger"
              style={{
                '--sc-stagger-index': 1,
                fontSize: 'clamp(2rem, 5vw, 2.8rem)',
                marginBottom: 'clamp(8px, 2vw, 10px)',
                fontWeight: 800,
                textShadow: '0 2px 20px rgba(0,0,0,0.2)',
                color: theme.onGradient,
                position: 'relative',
                letterSpacing: '-0.5px',
              } as CSSProperties}
            >
              SparkChat
            </h1>

            <p
              className="sc-anim-rise-in sc-stagger"
              style={{
                '--sc-stagger-index': 2,
                fontSize: 'clamp(0.95rem, 3vw, 1.10rem)',
                fontWeight: 300,
                margin: 0,
                position: 'relative',
                maxWidth: '100%',
                color: theme.onGradientMuted,
              } as CSSProperties}
            >
              Onde as conversas ganham energia
            </p>
          </div>

          <Card.Body style={{ padding: 'clamp(45px, 6vw, 45px)', background: theme.surfaceElevated }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 3vw, 16px)' }}>
              <button
                type="button"
                onClick={onNewUser}
                className="sc-btn sc-btn--gradient sc-btn--lift sc-anim-rise-in sc-stagger"
                style={{
                  '--sc-stagger-index': 3,
                  width: '100%',
                  padding: 'clamp(16px, 3vw, 20px)',
                  fontSize: 'clamp(1rem, 3vw, 1.15rem)',
                  fontWeight: 700,
                  borderRadius: '16px',
                  gap: 'clamp(8px, 2vw, 10px)',
                } as CSSProperties}
              >
                <FaPlusCircle size={20} />
                <span>Criar Nova Conta</span>
              </button>

              <button
                type="button"
                onClick={onExistingUser}
                className="sc-btn sc-btn--outline sc-btn--lift sc-anim-rise-in sc-stagger"
                style={{
                  '--sc-stagger-index': 4,
                  width: '100%',
                  padding: 'clamp(16px, 3vw, 20px)',
                  fontSize: 'clamp(1rem, 3vw, 1.15rem)',
                  fontWeight: 700,
                  borderRadius: '16px',
                  gap: 'clamp(8px, 2vw, 10px)',
                  borderColor: accentMid,
                  color: accentMid,
                } as CSSProperties}
              >
                <FaKey size={20} />
                <span>Já tenho conta</span>
              </button>
            </div>

            <div
              className="sc-anim-fade-in sc-stagger"
              style={{
                '--sc-stagger-index': 5,
                textAlign: 'center',
                fontSize: 'clamp(0.85rem, 2vw, 0.9rem)',
                color: theme.textSecondary,
                marginTop: 'clamp(20px, 4vw, 28px)',
                fontWeight: 400,
              } as CSSProperties}
            >
              Escolha como deseja entrar
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
