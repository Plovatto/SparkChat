import type { CSSProperties } from 'react';
import { useTheme } from '@features/theme';

type BubbleShape = { width: number; height: number; align: 'flex-start' | 'flex-end'; isImage?: boolean };

const BUBBLES: BubbleShape[] = [
  { width: 190, height: 150, align: 'flex-start', isImage: true },
  { width: 150, height: 34, align: 'flex-start' },
  { width: 210, height: 34, align: 'flex-end' },
  { width: 260, height: 54, align: 'flex-start' },
  { width: 130, height: 34, align: 'flex-start' },
  { width: 200, height: 170, align: 'flex-end', isImage: true },
  { width: 190, height: 54, align: 'flex-end' },
  { width: 100, height: 30, align: 'flex-start' },
  { width: 240, height: 34, align: 'flex-start' },
  { width: 170, height: 54, align: 'flex-end' },
  { width: 220, height: 34, align: 'flex-end' },
  { width: 180, height: 160, align: 'flex-start', isImage: true },
  { width: 140, height: 30, align: 'flex-start' },
  { width: 250, height: 54, align: 'flex-end' },
  { width: 120, height: 34, align: 'flex-start' },
  { width: 200, height: 34, align: 'flex-end' },
  { width: 150, height: 34, align: 'flex-start' },
];

function bubbleRadius(align: BubbleShape['align']) {
  return align === 'flex-end' ? '18px 18px 4px 18px' : '18px 18px 18px 4px';
}

export function MessageListSkeleton() {
  const { theme } = useTheme();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 4px', width: '100%' }}>
        {BUBBLES.map((bubble, index) => (
          <div
            key={index}
            className="shimmer-bg"
            style={
              {
                alignSelf: bubble.align,
                width: bubble.width,
                height: bubble.height,
                borderRadius: bubble.isImage ? '14px' : bubbleRadius(bubble.align),
                opacity: 0.4 + (index / (BUBBLES.length - 1)) * 0.6,
                flexShrink: 0,
                '--shimmer-a': theme.skeleton,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
