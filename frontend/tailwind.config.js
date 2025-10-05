/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',                      // <<—— important
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: { glow: '0 0 30px -10px rgba(16,163,127,0.55)' }
    }
  },
  plugins: []
}
