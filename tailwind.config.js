/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans:    ['"Geist"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // Culorile vin din variabilele CSS definite în style.css (:root + [data-theme="light"]).
      // Forma `rgb(var(--x) / <alpha-value>)` păstrează modificatorii de opacitate
      // Tailwind (ex: bg-ink-900/60) ȘI face ca toate utilitarele să urmeze tema.
      colors: {
        ink: {
          950: 'rgb(var(--c-ink-950-rgb) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900-rgb) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800-rgb) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700-rgb) / <alpha-value>)',
        },
        paper: {
          100: 'rgb(var(--c-paper-100-rgb) / <alpha-value>)',
          300: 'rgb(var(--c-paper-300-rgb) / <alpha-value>)',
          500: 'rgb(var(--c-paper-500-rgb) / <alpha-value>)',
        },
        signal: {
          400: 'rgb(var(--c-signal-400-rgb) / <alpha-value>)',
          300: 'rgb(var(--c-signal-300-rgb) / <alpha-value>)',
          500: 'rgb(var(--c-signal-500-rgb) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
