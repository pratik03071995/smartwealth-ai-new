/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',                      // <<—— important
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: { glow: '0 0 30px -10px rgba(177,140,255,0.8)' }
    }
  },
  plugins: []
}
