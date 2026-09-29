import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 produces one self-contained index.html (for hosting anywhere / artifact).
// Default build produces a normal PWA-capable dist/ with service worker + manifest.
const single = process.env.SINGLE === '1';

export default defineConfig({
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  base: './',
  build: {
    outDir: single ? 'dist-single' : 'dist',
    target: 'es2020',
    cssCodeSplit: !single,
    assetsInlineLimit: single ? 100000000 : 4096,
    chunkSizeWarningLimit: 700,
    rollupOptions: single
      ? {}
      : {
          output: {
            // Libraries change far less often than the app does, so they get
            // their own long-lived chunks.
            manualChunks: {
              react: ['react', 'react-dom'],
              motion: ['framer-motion'],
              icons: ['lucide-react'],
            },
          },
        },
  },
});
