import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,json,svg,png}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Prep Desk',
        short_name: 'Prep Desk',
        display: 'standalone',
        theme_color: '#1F1B16',
        background_color: '#F3EDE1',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    // R25: compile the content packs (dist/*.json) before any test imports them.
    globalSetup: ['../../packages/engine/vitest.global-setup.ts'],
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test-stubs/pwa-register-react.ts', import.meta.url),
      ),
    },
  },
});
