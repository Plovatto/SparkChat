import { useState } from 'react';
import { FaMoon, FaSun } from 'react-icons/fa';

interface ThemeToggleButtonProps {
  darkMode: boolean;
  onToggle: () => void;
  top?: string;
  right?: string;
}

const SPIN_DURATION_MS = 600;

export function ThemeToggleButton({ darkMode, onToggle, top = '10px', right = '10px' }: ThemeToggleButtonProps) {
  const [spinCount, setSpinCount] = useState(0);

  const handleClick = () => {
    onToggle();
    setSpinCount((previous) => previous + 1);
  };

  return (
    <span style={{ position: 'absolute', top, right, zIndex: 100, display: 'block', perspective: '520px' }}>
      <button
        type="button"
        onClick={handleClick}
        className="sc-toggle-icon"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.3rem',
          transform: `rotateY(${spinCount * 360}deg)`,
          transition: `transform ${SPIN_DURATION_MS}ms var(--sc-ease-spring-soft)`,
          willChange: spinCount > 0 ? 'transform' : undefined,
        }}
        title={darkMode ? 'Modo Claro' : 'Modo Escuro'}
        aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
      >
        {darkMode ? <FaSun /> : <FaMoon />}
      </button>
    </span>
  );
}
