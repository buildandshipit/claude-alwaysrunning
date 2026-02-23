const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'renderer/index.html'),
    path.join(__dirname, 'renderer/src/**/*.{js,ts,jsx,tsx}')
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e'
        },
        dark: {
          100: '#1e1e2e',
          200: '#1a1a2e',
          300: '#16162a',
          400: '#121226',
          500: '#0e0e22'
        }
      }
    }
  },
  plugins: []
};
