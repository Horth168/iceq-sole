import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'IceQ Sole — Premium Sneakers',
        short_name: 'IceQ Sole',
        description: 'Premium sneakers delivered across Cambodia.',
        theme_color: '#0A0A0B',
        background_color: '#F5F4F0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,webp,png}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\.(webp|jpg|jpeg|png|svg)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'iceq-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/products') || url.pathname === '/api/home',
            handler: 'NetworkFirst',
            options: { cacheName: 'iceq-catalog', networkTimeoutSeconds: 4, expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000', '/uploads': 'http://127.0.0.1:8000' },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
})
