/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        panel: '#1e1e2e',
        surface: '#181825',
        elevated: '#252539',
        border: '#313244',
        accent: '#89b4fa',
        'accent-strong': '#74c7ec',
        success: '#a6e3a1',
        warning: '#f9e2af',
        danger: '#f38ba8',
        muted: '#9399b2',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
