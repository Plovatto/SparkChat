import { useTheme } from '@features/theme';

interface SpinnerProps {
  size?: number;
  trackColor?: string;
  accentColor?: string;
}

export function Spinner({ size = 22, trackColor, accentColor }: SpinnerProps) {
  const { theme } = useTheme();
  const borderWidth = Math.max(2, Math.round(size / 8));

  return (
    <div
      className="loading-spinner"
      style={{
        width: size,
        height: size,
        border: `${borderWidth}px solid ${trackColor ?? theme.border}`,
        borderTop: `${borderWidth}px solid ${accentColor ?? theme.primary}`,
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  );
}
