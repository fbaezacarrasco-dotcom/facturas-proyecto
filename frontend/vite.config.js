import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// # Config de Vite
// # - Plugin React para Fast Refresh
// # - Proxy /api hacia el backend Express en dev para evitar problemas de CORS

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/files': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
