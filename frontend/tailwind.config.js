/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
          500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
        },
        night: { 800: '#151a2d', 900: '#0d1121', 950: '#080b16' },
      },
      boxShadow: { glow: '0 0 0 1px rgba(34,197,94,.25), 0 8px 30px -8px rgba(34,197,94,.45)' },
    },
  },
  plugins: [],
};
