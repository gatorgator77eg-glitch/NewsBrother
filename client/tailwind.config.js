/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bias-left': '#E3F2FD',
        'bias-left-accent': '#1565C0',
        'bias-center': '#F1F3F4',
        'bias-center-accent': '#5F6368',
        'bias-right': '#FFEBEE',
        'bias-right-accent': '#C62828',
        'bias-lean-left': '#E8F5E9',
        'bias-lean-left-accent': '#2E7D32',
        'bias-lean-right': '#FFF3E0',
        'bias-lean-right-accent': '#E65100',
      },
    },
  },
  plugins: [],
};
