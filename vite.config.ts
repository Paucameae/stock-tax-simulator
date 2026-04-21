/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
  build: {
    // Warn if the main entry chunk grows past ~600 kB.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Keep heavy optional deps in their own chunks so the initial bundle
        // stays small; lazy-loaded components pull these chunks on demand.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('pdfjs-dist')) return 'pdf';
            if (id.includes('recharts') || id.includes('/d3-')) return 'charts';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('react-dom') || /\/react\//.test(id)) return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
})
