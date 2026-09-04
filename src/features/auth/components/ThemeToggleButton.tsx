import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { FaMoon, FaSun } from 'react-icons/fa';
import type { LoginThemePalette } from '../types';

interface ThemeToggleButtonProps {
  darkMode: boolean;
  theme: LoginThemePalette;
  onToggle: () => void;
  top?: string;
  right?: string;
}

const ROTATION_STEP_DEGREES = 18;
const ROTATION_FRAME_MS = 16;

export function ThemeToggleButton({
  darkMode,
  theme,
  onToggle,
  top = '10px',
  right = '10px',
}: ThemeToggleButtonProps) {
  const [rotation, setRotation] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSpinning = rotation !== 0;

  const stopSpinning = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => stopSpinning, []);

  const handleClick = () => {
    onToggle();
    setRotation(0);
    stopSpinning();

    let currentRotation = 0;
    intervalRef.current = setInterval(() => {
      currentRotation += ROTATION_STEP_DEGREES;
      setRotation(currentRotation);

      if (currentRotation >= 360) {
        stopSpinning();
        setRotation(0);
      }
    }, ROTATION_FRAME_MS);
  };

  const handleMouseEnter = (event: MouseEvent<HTMLButtonElement>) => {
    if (isSpinning) {
      return;
    }
    event.currentTarget.style.transform = 'scale(1.1) rotate(10deg)';
  };

  const handleMouseLeave = (event: MouseEvent<HTMLButtonElement>) => {
    if (isSpinning) {
      return;
    }
    event.currentTarget.style.transform = 'scale(1) rotate(0deg)';
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-aos="fade-left"
      data-aos-delay="300"
      className="smooth-transition"
      style={{
        position: 'absolute',
        top,
        right,
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: `2px solid ${theme.bg}`,
        background: theme.cardBg,
        color: '#b483ecff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.3rem',
        zIndex: 100,
        transform: `rotateY(${rotation}deg)`,
        transition: 'none',
        willChange: 'transform',
        perspective: '1000px',
        transformStyle: 'preserve-3d',
      }}
      title={darkMode ? 'Modo Claro' : 'Modo Escuro'}
    >
      {darkMode ? <FaSun /> : <FaMoon />}
    </button>
  );
}
