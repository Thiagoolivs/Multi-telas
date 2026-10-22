/*
 * A folha de estilo da landing é COMPILADA, não montada no navegador.
 *
 * O arquivo de referência usava o Tailwind por CDN, que baixa um compilador
 * inteiro e monta o CSS na hora — atrasa a primeira pintura justamente na
 * página que precisa convencer alguém em três segundos. Aqui sai um .css
 * pronto, com só as classes usadas.
 *
 * Visual claro (22/10, decisão do dono): direção "varejo brasileiro, próximo",
 * com a loja de verdade no topo. Papel quente, tinta grafite, azul de ação e o
 * amarelo da marca como grifo. Poppins nos títulos, Nunito Sans no texto.
 */
module.exports = {
  // O landing.js também monta classes (simulador, contato): entra na varredura.
  content: ['./index.html', './landing.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nunito Sans"', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        mt: {
          papel: '#fffdf8',
          creme: '#fff4e5',
          linha: '#f1e6d3',
          tinta: '#1f2937',
          cinza: '#5f6673',
          azul: '#2265ff',
          'azul-escuro': '#1a4fd6',
          sol: '#fab914',
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
