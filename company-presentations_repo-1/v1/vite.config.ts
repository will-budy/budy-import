import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Everything in this version is served under /v1/. The build goes to dist/v1,
// so the dist folder can be deployed as it is next to future versions.
export default defineConfig({
  base: '/v1/',
  plugins: [react()],
  build: { outDir: 'dist/v1', emptyOutDir: true },
  test: { environment: 'node' },
});
