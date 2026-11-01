/*
 * A folha de estilo da landing é COMPILADA, não montada no navegador.
 *
 * O arquivo de referência usava o Tailwind por CDN, que baixa um compilador
 * inteiro e monta o CSS na hora — atrasa a primeira pintura justamente na
 * página que precisa convencer alguém em três segundos. Aqui sai um .css
 * pronto, com só as classes usadas.
 *
 * Visual claro (22/10, decisão do dono): direção "varejo brasileiro, próximo",
 * com a loja de verdade no topo. O papel quente fica; desde o QA de 26/10 as
 * cores e a letra são as da marca (docs/MARCA.md): tinta, violeta de ação,
 * lima como grifo, e Outfit em tudo.
 */
module.exports = {
  // O landing.js também monta classes (simulador, contato): entra na varredura.
  content: ['./index.html', './landing.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        mt: {
          papel: '#fffdf8',
          creme: '#fff4e5',
          linha: '#f1e6d3',
          tinta: '#0E0B1F',
          cinza: '#5c5a6b',
          violeta: '#5B2EFF',
          'violeta-escuro': '#4A22E0',
          lima: '#C6F432',
          zap: '#1f9d55',
        },
      },
      boxShadow: {
        quente: '0 8px 24px rgba(31, 41, 55, .08)',
        palco: '0 24px 60px -24px rgba(31, 41, 55, .35)',
      },
    },
  },
  plugins: [],
};
