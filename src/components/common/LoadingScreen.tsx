import Logo from '@/assets/Logo.svg';
import { buildTheme, withAlpha, type ThemeTokens } from '@features/theme';

const DEFAULT_LOADING_THEME = buildTheme('dark', 'standard').tokens;

interface LoadingScreenProps {
  theme?: ThemeTokens;
}

export function LoadingScreen({ theme = DEFAULT_LOADING_THEME }: LoadingScreenProps) {
  const ink = theme.onGradient;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.gradient,
        overflow: 'hidden',
      }}
    >
      <div
        className="sc-loading-orb"
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${withAlpha(ink, 0.15)} 0%, ${withAlpha(ink, 0.05)} 100%)`,
          top: '-150px',
          left: '-150px',
        }}
      />
      <div
        className="sc-loading-orb sc-loading-orb--slow"
        style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${withAlpha(ink, 0.1)} 0%, ${withAlpha(ink, 0.02)} 100%)`,
          bottom: '-100px',
          right: '-100px',
        }}
      />

      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <div style={{ width: '100px', height: '100px', margin: '0 auto 40px', position: 'relative' }}>
          <div
            className="loading-spinner"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              border: `4px solid ${withAlpha(ink, 0.25)}`,
              borderTop: `4px solid ${withAlpha(ink, 0.85)}`,
              borderRadius: '50%',
            }}
          />
          <div
            className="sc-loading-ring-reverse"
            style={{
              position: 'absolute',
              width: '70px',
              height: '70px',
              top: '15px',
              left: '15px',
              border: `3px solid ${withAlpha(ink, 0.15)}`,
              borderBottom: `3px solid ${withAlpha(ink, 0.7)}`,
              borderRadius: '50%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '12px',
              height: '12px',
              background: withAlpha(ink, 0.9),
              borderRadius: '50%',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 20px ${withAlpha(ink, 0.4)}`,
            }}
          />
        </div>

        <h2
          className="sc-loading-pulse"
          style={{
            color: ink,
            fontWeight: 700,
            marginBottom: '15px',
            fontSize: '2rem',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
          }}
        >
          <img src={Logo} alt="Logo" style={{ width: '2rem', marginRight: '0.5rem' }} />
          SparkChat
        </h2>
        <p
          className="sc-loading-pulse"
          style={{
            color: withAlpha(ink, 0.92),
            fontSize: '1.1rem',
            letterSpacing: '0.5px',
          }}
        >
          Carregando...
        </p>
      </div>
    </div>
  );
}
