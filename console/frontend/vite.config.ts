import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the static bundle works behind any private/Tailscale path prefix.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5179,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4178,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
