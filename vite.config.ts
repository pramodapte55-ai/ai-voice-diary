import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Forces relative path asset compilation for flawless mobile web loading
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  }
});