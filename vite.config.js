import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Zwei Builds:
//  - normal  → dist/        (Website auf GitHub Pages)
//  - single  → dist-single/ (eine einzige HTML-Datei für die Android-App und deren Selbst-Update)
export default defineConfig(({ mode }) => mode === 'single'
  ? { base: './', plugins: [viteSingleFile()], publicDir: false, build: { outDir: 'dist-single', emptyOutDir: true } }
  : { base: './', build: { outDir: 'dist', emptyOutDir: true } });
