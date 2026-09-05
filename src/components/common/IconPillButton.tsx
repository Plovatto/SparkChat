import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useTheme, type ThemeTokens } from '@features/theme';

export type IconPillTone = 'accent' | 'danger' | 'warning' | 'success';

interface IconPillButtonProps {
  icon: ReactNode;
  tone?: IconPillTone;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  fontSize?: string;
  gap?: string;
  paddingRight?: string;
  withShadow?: boolean;
  title?: string;
}

function resolveTone(theme: ThemeTokens, tone: IconPillTone): { background: string; color: string } {
  switch (tone) {
    case 'danger':
      return { background: theme.dangerSoft, color: theme.dangerText };
    case 'warning':
      return { background: theme.warningSoft, color: theme.warningText };
    case 'success':
      return { background: theme.successSoft, color: theme.successText };
    default:
      return { background: theme.accentSoft, color: theme.accentText };
  }
}

export function IconPillButton({
  icon,
  tone = 'accent',
  label,
  onClick,
  fontSize = '0.8rem',
  gap = '8px',
  paddingRight = '14px',
  withShadow = true,
  title,
}: IconPillButtonProps) {
  const { theme } = useTheme();
  const toneColors = resolveTone(theme, tone);

  return (
    <button
      onClick={onClick}
      title={title}
      className="sc-pill"
      data-shadow={withShadow}
      style={
        {
          gap,
          padding: `5px ${paddingRight} 5px 5px`,
          fontSize,
          '--pill-icon-bg': toneColors.background,
          '--pill-icon-color': toneColors.color,
        } as CSSProperties
      }
    >
      <span className="sc-pill__icon">{icon}</span>
      {label}
    </button>
  );
}
