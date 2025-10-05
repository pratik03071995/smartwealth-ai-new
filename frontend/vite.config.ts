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
        // Force IPv4 to avoid ::1 resolution issues on macOS
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
})
