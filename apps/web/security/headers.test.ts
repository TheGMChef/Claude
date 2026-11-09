import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inlineScriptHashes, metaCsp, parseCsp, parseHeaders } from './headers';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const headers = parseHeaders(read('../public/_headers'));
const all = headers['/*'] ?? {};
const csp = all['Content-Security-Policy'] ?? '';
const policy = parseCsp(csp);

describe('public/_headers', () => {
  it('sets a strict Content-Security-Policy', () => {
    expect(policy['default-src']).toEqual(["'self'"]);
    expect(policy['style-src']).toEqual(["'self'"]);
    expect(policy['connect-src']).toEqual(["'self'"]);
    expect(policy['worker-src']).toEqual(["'self'"]);
    expect(policy['manifest-src']).toEqual(["'self'"]);
    expect(policy['img-src']).toEqual(["'self'", 'data:']);
    expect(policy['font-src']).toEqual(["'self'", 'data:']); // Vite inlines small woff files
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'self'"]);
    expect(policy['form-action']).toEqual(["'self'"]);
  });

  it('never allows eval, inline code, wildcards, plain schemes or other origins', () => {
    for (const [name, sources] of Object.entries(policy)) {
      for (const s of sources) {
        expect(s, `${name} ${s}`).not.toMatch(
          /unsafe-eval|unsafe-inline|unsafe-hashes|wasm-unsafe|strict-dynamic|\*|^https?:|^blob:|^filesystem:|^ws/,
        );
        if (s === 'data:') expect(['img-src', 'font-src']).toContain(name);
        expect(s.startsWith("'") || s === 'data:', `${name} ${s} must be a keyword`).toBe(true);
      }
    }
  });

  it('script-src is self plus exactly the hashes of the inline scripts in index.html', () => {
    const hashes = inlineScriptHashes(read('../index.html'));
    expect(hashes).toHaveLength(1); // the theme script
    expect(policy['script-src']).toEqual(["'self'", ...hashes]);
  });

  it('a changed inline script no longer matches (the build check would fail)', () => {
    const html = read('../index.html').replace("'prepdesk.theme'", "'prepdesk.theme2'");
    expect(policy['script-src']).not.toContain(inlineScriptHashes(html)[0]);
  });

  it('sends the other hardening headers', () => {
    expect(all['Referrer-Policy']).toBe('no-referrer');
    expect(all['X-Content-Type-Options']).toBe('nosniff');
    expect(all['X-Frame-Options']).toBe('DENY');
    expect(all['Cross-Origin-Opener-Policy']).toBe('same-origin');
    for (const f of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(all['Permissions-Policy']).toContain(`${f}=()`);
    }
  });

  it('the meta policy is the header policy minus what meta cannot carry', () => {
    const meta = parseCsp(metaCsp(csp));
    expect(meta['frame-ancestors']).toBeUndefined();
    expect({ ...meta, 'frame-ancestors': policy['frame-ancestors'] }).toEqual(policy);
  });
});
