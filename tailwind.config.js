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
      colors: {
        ink:    { 950: '#0c0a09', 900: '#1c1917', 800: '#292524', 700: '#44403c' },
        paper:  { 100: '#fafaf9', 300: '#d6d3d1', 500: '#a8a29e' },
        signal: { 400: '#fb923c', 300: '#fdba74', 500: '#f97316' },
      },
    },
  },
  plugins: [],
};
