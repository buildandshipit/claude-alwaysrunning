import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'renderer'),
  base: './',
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'renderer/src')
    }
  },
  css: {
    postcss: {
      plugins: [
        require('tailwindcss')({
          config: path.join(__dirname, 'tailwind.config.js')
        }),
        require('autoprefixer')
      ]
    }
  }
});
