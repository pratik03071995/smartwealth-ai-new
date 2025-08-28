/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0b0c10',
        primary: '#b18cff',
        primaryDim: '#7b5bfb'
      },
      boxShadow: {
        glow: '0 0 30px -10px rgba(177,140,255,0.8)'
      }
    }
  },
  plugins: []
}
