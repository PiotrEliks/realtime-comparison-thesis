import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: { port: 3005 },
  resolve: {
    alias: {
      // Mapowanie pakietów workspace do plików źródłowych
      '@realtime-thesis/shared-ui':              path.resolve(__dirname, '../../packages/shared-ui/src'),
      '@realtime-thesis/communication-adapters': path.resolve(__dirname, '../../packages/communication-adapters/src'),
    },
  },
});