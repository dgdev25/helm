import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 7338, proxy: { '/api': 'http://localhost:7337' } },
  build: { outDir: 'dist' }
})
