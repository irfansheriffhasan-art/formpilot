import { defineConfig } from 'vite';

/**
 * Build #2: the content script.
 *
 * Content scripts injected into web pages cannot use `import` statements
 * between files. They must be ONE self-contained file. Vite's "library mode"
 * with the IIFE format gives us exactly that: every module the content
 * script imports is inlined into a single dist/content.js.
 */
export default defineConfig({
  // public/ is already copied by the main build; don't copy it twice.
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/content.ts',
      name: 'FormPilotContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
