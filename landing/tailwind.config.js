/*
 * A folha de estilo da landing é COMPILADA, não montada no navegador.
 *
 * O arquivo de referência usava o Tailwind por CDN, que baixa um compilador
 * inteiro e monta o CSS na hora — atrasa a primeira pintura justamente na
 * página que precisa convencer alguém em três segundos. Aqui sai um .css
 * pronto, com só as classes usadas.
 */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      fontFamily: { sans: ['Manrope', 'system-ui', 'sans-serif'], display: ['Anton', 'Impact', 'sans-serif'] },
      colors: {
        mt: {
          void: '#05070f',
          night: '#0a1020',
          deep: '#131f3e',
          brand: '#2f6feb',
          beam: '#56ccf2',
          gold: '#ffb703',
          ash: '#93a3c9',
        },
      },
    },
  },
  plugins: [],
};
