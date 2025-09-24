import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { 
    port: 5173,
    host: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '454c8ca24be4.ngrok-free.app',
      '69e3ac673021.ngrok-free.app',
      '.ngrok-free.app'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
})
