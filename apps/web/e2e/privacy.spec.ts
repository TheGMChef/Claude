import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

// The product promise: no network calls to anyone but the app's own origin, and a strict CSP
// with zero violations. One viewport is enough; the service worker is per-origin.
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => viewport?.width !== 1194, 'privacy checks run on tablet-landscape');

const ROUTES: Array<{ path: string; h1: string }> = [
  { path: '/', h1: 'Prep Desk' },
  { path: '/prep', h1: 'Prep Desk' },
  { path: '/table', h1: 'Prep Desk' },
  { path: '/codex', h1: 'Create a campaign' },
  { path: '/forge', h1: 'Create a campaign' },
  { path: '/campaigns/new', h1: 'Create a campaign' },
  { path: '/nope', h1: 'Nothing here' },
  { path: '/kit', h1: 'Kit' },
  { path: '/forge-preview', h1: 'Forge preview' },
];

type Watch = { foreign: string[]; errors: string[]; violations: string[] };

/** Watches the whole context (pages and the service worker) for foreign requests and errors. */
async function watch(context: BrowserContext, page: Page, origin: string): Promise<Watch> {
  const w: Watch = { foreign: [], errors: [], violations: [] };
  context.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== origin) w.foreign.push(req.url());
  });
  context.on('response', (res) => {
    if (res.status() >= 400) w.errors.push(`HTTP ${res.status()} ${res.url()}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') w.errors.push(`${msg.text()} ${msg.location().url}`);
  });
  page.on('pageerror', (err) => w.errors.push(String(err)));
  await page.exposeFunction('__cspViolation', (v: string) => w.violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as { __cspViolation(v: string): void }).__cspViolation;
      report(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`);
    });
  });
  return w;
}

test('every route loads with only same-origin requests, no console errors and no CSP violations', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL as string).origin;
  const w = await watch(context, page, origin);

  for (const { path, h1 } of ROUTES) {
    const res = await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();
    // The preview server sends public/_headers, as the static host would.
    const csp = (await res?.allHeaders())?.['content-security-policy'] ?? '';
    if (!res?.fromServiceWorker()) {
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("frame-ancestors 'none'");
    }
    // The meta policy travels with index.html too (offline, or a host that ignores _headers).
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  }
  // Exercise the dev page that does the most work (generate, reroll, names, oracle).
  await page.goto('/forge-preview');
  await page.getByRole('button', { name: 'Create NPC' }).click();
  await page.getByRole('button', { name: 'Reroll' }).click();
  await expect(page.getByRole('button', { name: 'Copy share code' })).toBeVisible();

  expect(w.foreign).toEqual([]);
  expect(w.violations).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('the service worker precaches only same-origin assets and caches nothing at runtime', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL as string).origin;
  const sw = await (await page.request.get('/sw.js')).text();
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] as string);
  expect(urls.length).toBeGreaterThan(10);
  for (const u of urls) expect(new URL(u, origin).origin, u).toBe(origin);
  expect(urls).toContain('index.html');
  // No runtime caching routes (Workbox registerRoute other than the navigation fallback).
  expect(sw).not.toMatch(/runtimeCaching|StaleWhileRevalidate|CacheFirst|NetworkFirst/);
  expect(sw).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);

  await page.goto('/');
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const out: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) out.push(req.url);
    }
    return out;
  });
  for (const u of cached) expect(new URL(u).origin, u).toBe(origin);
});

test('works offline under the CSP with no violations', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL as string).origin;
  const w = await watch(context, page, origin);
  await page.goto('/');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== 'activated') {
      await new Promise<void>((resolve) => {
        reg.active?.addEventListener('statechange', () => {
          if (reg.active?.state === 'activated') resolve();
        });
      });
    }
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state))
    .toBe('activated');
  await context.setOffline(true);
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'Prep Desk' })).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await context.setOffline(false);
  expect(w.foreign).toEqual([]);
  expect(w.violations).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('control: the CSP blocks a third-party request and the watcher sees it', async ({
  page,
  context,
  baseURL,
}) => {
  const w = await watch(context, page, new URL(baseURL as string).origin);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Prep Desk' })).toBeVisible();
  const blocked = await page.evaluate(() =>
    fetch('https://example.invalid/track').then(
      () => false,
      () => true,
    ),
  );
  expect(blocked).toBe(true);
  await expect
    .poll(() => w.violations.join('\n'))
    .toMatch(/connect-src https:\/\/example\.invalid/);
  // An injected inline script does not run (DevTools evaluate itself is exempt from CSP, so the
  // check goes through a real script element).
  const ran = await page.evaluate(async () => {
    const el = document.createElement('script');
    el.textContent = 'window.__injected = true';
    document.head.append(el);
    await new Promise((r) => setTimeout(r, 50));
    return (window as unknown as { __injected?: boolean }).__injected === true;
  });
  expect(ran).toBe(false);
  await expect.poll(() => w.violations.join('\n')).toMatch(/script-src(-elem)? inline/);
});
