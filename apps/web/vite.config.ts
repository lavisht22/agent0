import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 2222,
    // Proxy the runner's surfaces so the dev browser sees everything as
    // same-origin (:2222) — exactly like prod, where the runner serves the SPA.
    // This makes the httpOnly session cookie first-party with no CORS, and lets
    // the app use relative URLs in both dev and prod. SSE (/internal/test)
    // streams through http-proxy unbuffered.
    proxy: {
      '/api': { target: 'http://localhost:2223', changeOrigin: true },
      '/internal': { target: 'http://localhost:2223', changeOrigin: true },
    },
  },
})
