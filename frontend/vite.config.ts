import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The repeat-schedule maths is shared with the backend so the calendar matches what really sends.
      '@recurrence': path.resolve(__dirname, '../backend/src/lib/recurrence.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/u/': 'http://localhost:3000',
      '/t/': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
