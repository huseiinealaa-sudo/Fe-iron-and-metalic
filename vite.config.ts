import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` targets GitHub Pages at /Fe-iron-and-metalic/.
// Override with VITE_BASE=/ for a root-hosted deploy.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/Fe-iron-and-metalic/',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
})
