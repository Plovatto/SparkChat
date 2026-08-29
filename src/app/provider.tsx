import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '@features/theme';

export function AppProvider({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
