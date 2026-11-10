import { KIND_LABELS } from '../content/labels';
import type { Entity } from './schema';

/** Hard bounds so hostile input (a pasted book, a crafted backup) can't stall a save or a search. */
export const MAX_FOLD_LENGTH = 200_000;
export const MAX_TOKEN_LENGTH = 64;
export const MAX_TOKENS = 5_000;
export const MAX_TITLE_LENGTH = 200;

/** NFKD, combining marks removed, lowercase, whitespace collapsed and trimmed (D56). Linear time. */
export function fold(s: string): string {
  return s
    .slice(0, MAX_FOLD_LENGTH)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/\s+/u)
    .filter((w) => w !== '')
    .join(' ');
}

/** Folded text split on anything that isn't a letter or a digit (D58). Bounded in token size and count. */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const raw of fold(s).split(/[^\p{L}\p{N}]+/u)) {
    if (raw === '') continue;
    out.push(raw.length > MAX_TOKEN_LENGTH ? raw.slice(0, MAX_TOKEN_LENGTH) : raw);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

/** The distinct search tokens of an entity (D58): title, aliases, summary, field values, kind label. */
export function entityTokens(
  e: Pick<Entity, 'kind' | 'title' | 'aliases' | 'summary' | 'fields'>,
): string[] {
  const seen = new Set<string>();
  const add = (text: string) => {
    for (const t of tokenize(text)) {
      if (seen.size >= MAX_TOKENS) return;
      seen.add(t);
    }
  };
  add(e.title);
  for (const a of e.aliases) add(a);
  add(e.summary);
  for (const v of Object.values(e.fields)) add(v);
  add(KIND_LABELS[e.kind]);
  return [...seen];
}

/** The trimmed title, or null when it is empty, over 200 characters, or has `[[`, `]]` or `|` (D56). */
export function validTitle(s: string): string | null {
  const t = s.trim();
  if (t === '' || t.length > MAX_TITLE_LENGTH) return null;
  if (t.includes('[[') || t.includes(']]') || t.includes('|')) return null;
  return t;
}
