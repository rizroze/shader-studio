import { defineConfig } from 'vite';

// Vanilla + Vite. GLSL files imported with ?raw (built-in, no plugin needed).
export default defineConfig({
  server: { open: true, port: 5178 },
  build: { target: 'es2022' },
});
