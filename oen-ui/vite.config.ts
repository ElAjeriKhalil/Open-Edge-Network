import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/agent': {
        target: process.env.VITE_AGENT_URL || 'http://127.0.0.1:8788',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/agent/, '')
      }
    }
  }
});
