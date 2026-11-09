import { createHash } from 'node:crypto';

/** `_headers` (Cloudflare Pages / Netlify): path lines, then indented `Name: value` lines. */
export function parseHeaders(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = {};
      out[line.trim()] = current;
      continue;
    }
    const colon = line.indexOf(':');
    if (current && colon > 0) current[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return out;
}

/** CSP source expressions (`'sha256-…'`) for every inline (src-less) script in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const digest = createHash('sha256')
      .update(m[1] ?? '', 'utf8')
      .digest('base64');
    out.push(`'sha256-${digest}'`);
  }
  return out;
}

/** Directive name to its source list. */
export function parseCsp(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

/** The policy a `<meta http-equiv>` may carry: meta ignores frame-ancestors, sandbox, report-*. */
export function metaCsp(csp: string): string {
  return csp
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d !== '' && !/^(frame-ancestors|sandbox|report-uri|report-to)\b/.test(d))
    .join('; ');
}
