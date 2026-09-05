import type { PropsWithChildren } from 'react';
import { CustomCursor } from '@components/common/CustomCursor';
import { ThemeProvider } from '@features/theme';

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      {children}
      <CustomCursor />
    </ThemeProvider>
  );
}
