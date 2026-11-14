import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readBuildInfo } from './scripts/buildInfo.ts';

export default defineConfig({
  base: './',
  define: { BUILD_INFO: JSON.stringify(readBuildInfo(process.cwd())) },
  plugins: [react()],
  // Phaser alone is ~1.2 MB minified; warn only above that.
  build: { chunkSizeWarningLimit: 1600 },
  server: { port: 8080, strictPort: true },
  preview: { port: 8080, strictPort: true },
});
