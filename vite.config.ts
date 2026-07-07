import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Explicitly increase the cache limit to allow offline storage of the OpenCV models
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
      },
      manifest: {
        name: 'SmileRise',
        short_name: 'SmileRise',
        description: 'Capture frames with Smiling Faces from Videos',
        theme_color: '#EAE3DB',
        background_color: '#b0a497',
        display: 'standalone',
        icons: [
          {
            src: '/SmileRise-logo192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/SmileRise-logo512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
