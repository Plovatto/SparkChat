import type { ReactNode } from 'react';

type OverlayIconButtonVariant = 'default' | 'danger';

interface OverlayIconButtonProps {
  onClick: () => void;
  title: string;
  variant?: OverlayIconButtonVariant;
  children: ReactNode;
}

const VARIANT_STYLES: Record<OverlayIconButtonVariant, { background: string; hoverBackground: string; fontSize: string }> = {
  default: { background: 'rgba(255, 255, 255, 0.12)', hoverBackground: 'rgba(255, 255, 255, 0.25)', fontSize: '15px' },
  danger: { background: 'rgba(239, 68, 68, 0.85)', hoverBackground: 'rgba(239, 68, 68, 1)', fontSize: '16px' },
};

export function OverlayIconButton({ onClick, title, variant = 'default', children }: OverlayIconButtonProps) {
  const { background, hoverBackground, fontSize } = VARIANT_STYLES[variant];

  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background,
        border: 'none',
        color: 'white',
        width: 'clamp(34px, 9vw, 40px)',
        height: 'clamp(34px, 9vw, 40px)',
        borderRadius: '50%',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s ease',
        fontSize,
        flexShrink: 0,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = hoverBackground;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = background;
      }}
    >
      {children}
    </button>
  );
}
