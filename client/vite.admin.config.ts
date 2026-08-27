import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync, renameSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'admin-index-html',
      closeBundle() {
        const from = path.resolve(__dirname, 'dist-admin/admin.html')
        const to = path.resolve(__dirname, 'dist-admin/index.html')
        if (existsSync(from)) renameSync(from, to)
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/admin/',
  publicDir: false,
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    cssCodeSplit: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'admin.html'),
    },
  },
})
