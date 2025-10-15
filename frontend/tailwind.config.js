/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1f2937',
        accent: '#8b5cf6',
      },
    },
  },
  plugins: [],
};
