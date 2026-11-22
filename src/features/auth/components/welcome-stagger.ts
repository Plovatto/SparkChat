import type { CSSProperties } from 'react';

export function stagger(index: number): CSSProperties {
  return { '--welcome-i': index } as CSSProperties;
}
