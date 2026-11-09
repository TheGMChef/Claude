import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { inlineScriptHashes, metaCsp, parseCsp, parseHeaders } from './security/headers';

// One source of truth for the security headers: public/_headers (what static hosts serve).
const HEADERS = parseHeaders(
  readFileSync(fileURLToPath(new URL('./public/_headers', import.meta.url)), 'utf8'),
)['/*'] as Record<string, string>;
const CSP = HEADERS['Content-Security-Policy'] as string;

/**
 * Build only (the dev server injects inline scripts): fails the build when an inline script's hash
 * is missing from the CSP, and adds the meta-safe part of the CSP to index.html, so hosts that
 * ignore _headers still get it.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'prepdesk-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const allowed = parseCsp(CSP)['script-src'] ?? [];
        const missing = inlineScriptHashes(html).filter((h) => !allowed.includes(h));
        if (missing.length > 0) {
          throw new Error(`public/_headers script-src is missing ${missing.join(' ')}`);
        }
        const meta = `<meta http-equiv="Content-Security-Policy" content="${metaCsp(CSP)}" />`;
        return html.replace(/(<meta charset="UTF-8" \/>)/, `$1\n    ${meta}`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    contentSecurityPolicy(),
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
  // `vite preview` (e2e) serves the production headers, so every e2e spec runs under the CSP.
  preview: { headers: HEADERS },
  test: {
    environment: 'jsdom',
    globals: true,
    // Playwright specs live in e2e/ and run under `pnpm e2e`.
    exclude: [...configDefaults.exclude, 'e2e/**'],
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
