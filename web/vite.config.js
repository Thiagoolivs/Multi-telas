import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O painel React vive em /app (servido pelo server.js a partir de web/dist),
// coexistindo com o admin vanilla enquanto a migração acontece tela a tela.
// No dev (`npm run dev`), o Vite sobe em :5173 e faz proxy de /api para o
// servidor Node em :8080.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  /*
   * `manifest` faz o Vite escrever a lista de arquivos gerados em
   * dist/ativos.json. Quem lê é o service worker do painel.
   *
   * O motivo é concreto: o editor entra por `import()` e vira um pacote à
   * parte, com hash no nome. Sem esta lista, o worker só guardava o que a
   * página tinha pedido até ali — e, offline, abrir o editor pela primeira vez
   * derrubava o app inteiro, porque um `import()` que falha rejeita e o React
   * desmonta a árvore. A promessa de "abre sem internet" tem que valer para o
   * app todo, não só para a primeira tela.
   */
  build: { outDir: 'dist', emptyOutDir: true, manifest: 'ativos.json' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
