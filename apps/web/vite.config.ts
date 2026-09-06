import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  resolve: {
    alias: [
      {
        find: /^ejs$/,
        replacement: fileURLToPath(import.meta.resolve('ejs/ejs.min.js')),
      },
      {
        find: '#pdfjs-dist',
        replacement: normalizePath(
          fileURLToPath(
            new URL('.', import.meta.resolve('pdfjs-dist/package.json')),
          ),
        ),
      },
    ],
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    license: true,
    rolldownOptions: {
      output: {
        // Engine loaders request companion files by their original names.
        assetFileNames: 'runtime/[name][extname]',
      },
    },
  },
});
