import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      }
    }
  },
  build: {
    // Зменшуємо розмір попередження (за дефолтом 500kb)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Виносимо React та основні ліби в окремий чанк
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Framer Motion дуже важкий, його окремо
            if (id.includes('framer-motion')) {
              return 'framer-motion';
            }
            // Lightbox теж не всім потрібен одразу
            if (id.includes('yet-another-react-lightbox')) {
              return 'lightbox';
            }
            // UI бібліотеки
            if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-vendor';
            }
            // Все інше
            return 'vendor';
          }
        },
      },
    },
  },
})
