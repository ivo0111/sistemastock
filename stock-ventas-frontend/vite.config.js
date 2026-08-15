import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // Mismo proxy que en dev, pero para `vite preview` (que sirve el build de
  // producción). El frontend llama a rutas relativas ("/api/v1/..."), así
  // que sin este proxy esas llamadas irían al propio servidor estático del
  // frontend en vez de al backend. Ver "Iniciar Sistema.bat" e INSTALACION.md.
  preview: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})