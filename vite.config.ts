import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build #1: extension pages (popup) + background service worker.
 *
 * Both of these are allowed to use ES modules in Manifest V3, so Vite can
 * split shared code into chunks that they import from each other.
 *
 * The content script is NOT built here. See vite.content.config.ts.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // We clean dist/ ourselves in the npm scripts. If Vite emptied it here,
    // watch mode could delete content.js produced by the other build.
    emptyOutDir: false,
    rollupOptions: {
      // Each key becomes an output file. The popup is an HTML entry;
      // Vite follows its <script> tag to find main.tsx.
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
        'service-worker': 'src/background/service-worker.ts',
      },
      output: {
        // Stable names (no hashes) so manifest.json can point at them.
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
