import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
      '/admin': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Змушуємо rollup дробити CSS теж
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Стратегія: Кожен пакет з node_modules - це потенційно окремий чанк
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Розбиваємо шлях, щоб отримати назву пакета
            // Приклад id: .../node_modules/react-dom/index.js -> 'react-dom'
            // Приклад id: .../node_modules/@radix-ui/react-slot/dist/index.mjs -> '@radix-ui/react-slot'
            const parts = id.toString().split('node_modules/');
            if (parts.length > 1) {
              const libraryName = parts[parts.length - 1].split('/')[0];

              // 1. Групуємо дріб'язок (щоб не плодити файли по 1кб)
              if (['react', 'react-dom', 'scheduler', 'react-is', 'prop-types'].includes(libraryName)) {
                return 'react-vendor'; // Все ще тримаємо ядро разом заради безпеки
              }

              if (['@radix-ui', 'class-variance-authority', 'clsx', 'tailwind-merge'].includes(libraryName) || libraryName.startsWith('@radix-ui')) {
                return 'ui-vendor';
              }

              if (['@reduxjs', 'react-redux', 'redux', 'redux-thunk', 'immer'].includes(libraryName)) {
                return 'redux-vendor';
              }

              // 2. Все велике - окремо
              if (libraryName === 'framer-motion') return 'framer-motion';
              if (libraryName === 'lucide-react') return 'lucide-icons';
              if (libraryName === 'yet-another-react-lightbox') return 'lightbox';
              if (libraryName === 'date-fns') return 'date-fns';
              if (libraryName === 'country-flag-icons') return 'flags';

              // 3. Решту групуємо, щоб не смітити
              return 'vendor-misc';
            }
          }
        },
      },
    },
  },
});
