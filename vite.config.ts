import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 部署在子路径 /claw3d/ 下，生产构建需要设置 base
// 本地开发保持 '/' 以获得最简路径
const repoName = 'claw3d'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${repoName}/` : '/',
  server: { host: true },
}))
