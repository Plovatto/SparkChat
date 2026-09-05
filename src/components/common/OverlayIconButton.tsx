import type { ReactNode } from 'react';

type OverlayIconButtonVariant = 'default' | 'danger';

interface OverlayIconButtonProps {
  onClick: () => void;
  title: string;
  variant?: OverlayIconButtonVariant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<OverlayIconButtonVariant, string> = {
  default: 'sc-icon-btn--scrim',
  danger: 'sc-icon-btn--scrim-danger',
};

export function OverlayIconButton({ onClick, title, variant = 'default', children }: OverlayIconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`sc-icon-btn ${VARIANT_CLASS[variant]}`}
      style={{
        width: 'clamp(34px, 9vw, 40px)',
        height: 'clamp(34px, 9vw, 40px)',
        fontSize: variant === 'danger' ? '16px' : '15px',
      }}
    >
      {children}
    </button>
  );
}
