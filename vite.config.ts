import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@app': path.resolve(import.meta.dirname, 'src/app'),
      '@features': path.resolve(import.meta.dirname, 'src/features'),
      '@components': path.resolve(import.meta.dirname, 'src/components'),
      '@hooks': path.resolve(import.meta.dirname, 'src/hooks'),
      '@lib': path.resolve(import.meta.dirname, 'src/lib'),
      '@constants': path.resolve(import.meta.dirname, 'src/constants'),
      '@config': path.resolve(import.meta.dirname, 'src/config'),
    },
  },
  server: {
    port: 5173,
  },
});
