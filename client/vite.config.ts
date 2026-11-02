import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks to Vite (5173); Vite forwards /api to the Express backend (4000) => no CORS problems in local mode.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:4000', changeOrigin: true } } },
  preview: { port: 5173, proxy: { '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:4000', changeOrigin: true } } },
});
