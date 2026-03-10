/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        fantasy: {
          bg: '#1a1612',
          surface: '#2d2620',
          'surface-hover': '#3d3528',
          input: '#3d3528',
          'input-hover': '#4a4036',
          border: '#4a4036',
          text: '#e8e0d4',
          muted: '#a8987a',
          accent: '#c9a227',
          'accent-hover': '#d4a84b',
          error: '#c75c5c',
          danger: '#a63d3d',
          'text-soft': '#c9bda8',
          'muted-soft': '#8f7f68',
          'input-soft': '#352d24',
          'input-hover-soft': '#3d3528',
          'border-soft': '#3d3528',
        },
      },
      fontFamily: {
        heading: ['Cinzel', 'serif'],
        body: ['Crimson Text', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
