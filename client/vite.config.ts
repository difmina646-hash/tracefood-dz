
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget =
  process.env.VITE_API_TARGET ??
  'https://tracefood-dz-production.up.railway.app';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
