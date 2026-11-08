// Renders public/icons/icon.svg to the PWA PNG icons with the pre-installed Playwright Chromium.
// Usage: node scripts/make-icons.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const PAPER = '#F3EDE1';

// scale 1 = artwork fills the square; 0.8 keeps it inside the maskable safe zone.
const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'maskable-512.png', size: 512, scale: 0.8 },
];

const browser = await chromium.launch();
try {
  for (const { file, size, scale } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const art = Math.round(size * scale);
    await page.setContent(
      `<body style="margin:0;background:${PAPER};display:grid;place-items:center;width:${size}px;height:${size}px">` +
        `<img src="${dataUri}" width="${art}" height="${art}" style="display:block"></body>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    writeFileSync(`${dir}${file}`, await page.screenshot({ type: 'png' }));
    await page.close();
  }
} finally {
  await browser.close();
}
