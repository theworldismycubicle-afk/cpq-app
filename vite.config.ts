import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: true,
    // In dev, proxy API calls to the Express server so the client uses one origin.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
