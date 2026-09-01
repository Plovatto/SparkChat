import { useTheme } from '@features/theme';

const BUBBLES = [
  { width: 170, align: 'flex-start' as const },
  { width: 220, align: 'flex-end' as const },
  { width: 140, align: 'flex-start' as const },
  { width: 190, align: 'flex-start' as const },
  { width: 160, align: 'flex-end' as const },
];

export function MessageListSkeleton() {
  const { theme } = useTheme();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 4px', width: '100%' }}>
      {BUBBLES.map((bubble, index) => (
        <div
          key={index}
          style={{
            alignSelf: bubble.align,
            width: bubble.width,
            height: 38,
            borderRadius: bubble.align === 'flex-end' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            background: theme.surfaceLight,
            animation: 'pulse 1.4s ease-in-out infinite',
            animationDelay: `${index * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}
