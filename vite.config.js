import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/sitekit/',  // For GitHub Pages deployment at bryanralston.github.io/sitekit/
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
  },
});
