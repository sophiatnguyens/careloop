import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the client runs on :5173 and forwards API and WebSocket traffic to the server on :3001.
export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: { outDir: '../../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
