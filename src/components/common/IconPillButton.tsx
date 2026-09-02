import type { MouseEvent, ReactNode } from 'react';

interface IconPillButtonProps {
  icon: ReactNode;
  iconBackground: string;
  iconColor: string;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  background: string;
  textColor: string;
  fontSize?: string;
  gap?: string;
  paddingRight?: string;
  withShadow?: boolean;
}

export function IconPillButton({
  icon,
  iconBackground,
  iconColor,
  label,
  onClick,
  background,
  textColor,
  fontSize = '0.8rem',
  gap = '8px',
  paddingRight = '14px',
  withShadow = true,
}: IconPillButtonProps) {
  const baseShadow = withShadow ? '0 3px 10px rgba(0, 0, 0, 0.18)' : 'none';
  const hoverShadow = withShadow ? '0 5px 14px rgba(0, 0, 0, 0.22)' : 'none';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap,
        background,
        border: 'none',
        color: textColor,
        borderRadius: '999px',
        padding: `5px ${paddingRight} 5px 5px`,
        fontSize,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: baseShadow,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'translateY(-2px)';
        event.currentTarget.style.boxShadow = hoverShadow;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'translateY(0)';
        event.currentTarget.style.boxShadow = baseShadow;
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: iconBackground,
          color: iconColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}
