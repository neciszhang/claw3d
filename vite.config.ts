import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves at sub-path /claw3d/, so production builds need base set accordingly
// Keep '/' for local dev to get the simplest path
const repoName = 'claw3d'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${repoName}/` : '/',
  server: { host: true },
  build: {
    // Vendor chunks: three / rapier (embedded wasm) / react rarely change,
    // so returning visitors keep them cached across app deploys
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          physics: ['@dimforge/rapier3d-compat'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
}))
