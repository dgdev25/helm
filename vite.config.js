import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.FRONTEND_PORT ?? '47621'),
    proxy: { '/api': `http://localhost:${process.env.BACKEND_PORT ?? '47821'}` }
  },
  build: { outDir: 'dist' }
})
