/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Couleurs pilotées par le thème (variables CSS, voir src/index.css).
        fantasy: {
          bg: 'rgb(var(--c-bg) / <alpha-value>)',
          surface: 'rgb(var(--c-surface) / <alpha-value>)',
          'surface-hover': 'rgb(var(--c-surface-hover) / <alpha-value>)',
          input: 'rgb(var(--c-input) / <alpha-value>)',
          'input-hover': 'rgb(var(--c-input-hover) / <alpha-value>)',
          border: 'rgb(var(--c-border) / <alpha-value>)',
          text: 'rgb(var(--c-text) / <alpha-value>)',
          muted: 'rgb(var(--c-muted) / <alpha-value>)',
          accent: 'rgb(var(--c-accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--c-accent-hover) / <alpha-value>)',
          secondary: 'rgb(var(--c-secondary) / <alpha-value>)',
          error: 'rgb(var(--c-error) / <alpha-value>)',
          danger: 'rgb(var(--c-danger) / <alpha-value>)',
          success: 'rgb(var(--c-success) / <alpha-value>)',
          'text-soft': 'rgb(var(--c-text-soft) / <alpha-value>)',
          'muted-soft': 'rgb(var(--c-muted-soft) / <alpha-value>)',
          'input-soft': 'rgb(var(--c-input-soft) / <alpha-value>)',
          'input-hover-soft': 'rgb(var(--c-input-hover-soft) / <alpha-value>)',
          'border-soft': 'rgb(var(--c-border-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        heading: ['Cinzel', 'serif'],
        body: ['Alegreya Sans', 'system-ui', 'sans-serif'],
        prose: ['Crimson Text', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
