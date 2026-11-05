/** @type {import('tailwindcss').Config} */
// Design system MultiTelas — sóbrio, operacional, denso. Cores neutras +
// um único acento contido. Tokens expostos como CSS vars (ver index.css)
// para permitir tema claro/escuro sem reescrever componentes.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',      // fundo do app
        surface: 'rgb(var(--c-surface) / <alpha-value>)',    // painéis
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)', // hover/sutil
        line: 'rgb(var(--c-line) / <alpha-value>)',          // bordas
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',            // texto primário
        'ink-2': 'rgb(var(--c-ink-2) / <alpha-value>)',      // secundário
        'ink-3': 'rgb(var(--c-ink-3) / <alpha-value>)',      // terciário/placeholder
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--c-accent-fg) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        'ok-soft': 'rgb(var(--c-ok-soft) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        'warn-soft': 'rgb(var(--c-warn-soft) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--c-danger-soft) / <alpha-value>)',
      },
      fontFamily: {
        // Outfit, a letra da marca (docs/MARCA.md). Antes: 'Inter', que o painel nunca carregava — saía a do sistema.
        sans: ['Outfit', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        /*
         * A ESCALA DA FASE 8 (BLOCO-8 §4.5): o painel era de ferramenta
         * técnica (corpo de 13 px, título de seção também de 13, e a página
         * pulando para 22), e tudo tinha o mesmo peso. Agora:
         *   corpo 15 · título de seção 17 · título de página 28 (24 no
         *   celular) · números grandes 32 · nada abaixo de 12 (13 no celular).
         * As duas menores e o título de página mudam com a tela (index.css).
         */
        '2xs': ['var(--fs-2xs)', { lineHeight: 'var(--lh-2xs)' }],   // 12 · 13 no celular
        xs: ['var(--fs-xs)', { lineHeight: 'var(--lh-xs)' }],        // 13 · 13 no celular
        sm: ['0.9375rem', { lineHeight: '1.4rem' }],     // 15: o corpo
        base: ['1rem', { lineHeight: '1.5rem' }],        // 16
        md: ['1rem', { lineHeight: '1.5rem' }],          // 16
        lg: ['1.0625rem', { lineHeight: '1.55rem' }],    // 17: título de seção
        xl: ['var(--fs-xl)', { lineHeight: 'var(--lh-xl)' }],        // 28: título de página · 24 no celular
        '2xl': ['2rem', { lineHeight: '2.4rem' }],       // 32: números grandes
      },
      borderRadius: { sm: '5px', DEFAULT: '7px', md: '8px', lg: '10px', xl: '14px' },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        sm: '0 1px 2px 0 rgb(16 24 40 / 0.06), 0 1px 3px 0 rgb(16 24 40 / 0.04)',
        pop: '0 6px 16px -4px rgb(16 24 40 / 0.12), 0 2px 6px -2px rgb(16 24 40 / 0.06)',
      },
      ringColor: { DEFAULT: 'rgb(var(--c-accent) / 0.35)' },
    },
  },
  plugins: [],
};
