import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiProxy = {
  '/backend': {
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/backend/, ''),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0', port: 5173, proxy: apiProxy, allowedHosts: ['.trycloudflare.com'] },
  preview: { host: '0.0.0.0', port: 4173, proxy: apiProxy, allowedHosts: ['.trycloudflare.com'] },
});
