import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O painel React vive em /app (servido pelo server.js a partir de web/dist),
// coexistindo com o admin vanilla enquanto a migração acontece tela a tela.
// No dev (`npm run dev`), o Vite sobe em :5173 e faz proxy de /api para o
// servidor Node em :8080.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
