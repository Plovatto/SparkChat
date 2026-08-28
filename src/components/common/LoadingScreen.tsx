import Logo from '@/assets/Logo.svg';

const DEFAULT_GRADIENT = 'linear-gradient(135deg, #516ce4 0%, #7e37b9 50%, #516ce4 100%)';

export function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: DEFAULT_GRADIENT,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%)',
          top: '-150px',
          left: '-150px',
          animation: 'loadingFloat 8s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%)',
          bottom: '-100px',
          right: '-100px',
          animation: 'loadingFloat 10s ease-in-out infinite reverse',
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
              border: '4px solid rgba(255, 255, 255, 0.25)',
              borderTop: '4px solid rgba(255, 255, 255, 0.8)',
              borderRadius: '50%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '70px',
              height: '70px',
              top: '15px',
              left: '15px',
              border: '3px solid rgba(255, 255, 255, 0.15)',
              borderBottom: '3px solid rgba(255, 255, 255, 0.7)',
              borderRadius: '50%',
              animation: 'spin 1.5s linear infinite reverse',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '12px',
              height: '12px',
              background: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '50%',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 20px rgba(255, 255, 255, 0.4)',
            }}
          />
        </div>

        <h2
          style={{
            color: 'white',
            fontWeight: 700,
            marginBottom: '15px',
            fontSize: '2rem',
            animation: 'loadingPulse 2s ease-in-out infinite',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
          }}
        >
          <img src={Logo} alt="Logo" style={{ width: '2rem', marginRight: '0.5rem' }} />
          SparkChat
        </h2>
        <p
          style={{
            color: 'rgba(255, 255, 255, 0.95)',
            fontSize: '1.1rem',
            animation: 'loadingPulse 2s ease-in-out infinite',
            letterSpacing: '0.5px',
          }}
        >
          Carregando...
        </p>
      </div>

      <style>{`
        @keyframes loadingPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        @keyframes loadingFloat {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
