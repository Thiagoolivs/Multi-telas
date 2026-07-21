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
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],   // 11
        xs: ['0.75rem', { lineHeight: '1.1rem' }],       // 12
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],    // 13
        base: ['0.875rem', { lineHeight: '1.375rem' }],  // 14 (base de dashboard)
        md: ['0.9375rem', { lineHeight: '1.5rem' }],     // 15
        lg: ['1.0625rem', { lineHeight: '1.6rem' }],     // 17
        xl: ['1.375rem', { lineHeight: '1.8rem' }],      // 22
        '2xl': ['1.75rem', { lineHeight: '2.1rem' }],    // 28
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
