/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// A version string that changes on every deploy so the service worker can
// scope its cache per-build and purge older caches on activation. Prefer the
// git commit hash (stable + traceable); fall back to a build timestamp.
function resolveBuildVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return `t${Date.now()}`;
  }
}

// Replace the `__SW_VERSION__` placeholder in the emitted public/sw.js with the
// build version. Files in public/ are copied verbatim by Vite, so we post-process
// the output in closeBundle (after it has been written to the output dir).
function swVersionPlugin(version: string): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw.js');
      try {
        const src = readFileSync(swPath, 'utf8');
        writeFileSync(swPath, src.replace(/__SW_VERSION__/g, version), 'utf8');
      } catch {
        // No sw.js in output (e.g. library build) — nothing to do.
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), swVersionPlugin(resolveBuildVersion())],
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
