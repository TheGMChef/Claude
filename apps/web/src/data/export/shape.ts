import { ROW_CAPS } from './schema';

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
export const MAX_DEPTH = 7;
export const MAX_STRING = 200_000;
const MAX_KEY = 100;
const MAX_OBJECT_KEYS = 200;
const MAX_NESTED_ARRAY = 5_000;
const MAX_ROOT_KEYS = 30;

/**
 * Walks parsed JSON iteratively (no recursion, so depth can't overflow the stack) and returns false
 * on prototype keys anywhere, nesting past MAX_DEPTH, strings past 200,000 characters, long keys,
 * wide objects, or arrays past the per-store row caps (root) or 5,000 (nested). Runs before zod,
 * which would otherwise drop a `__proto__` key silently and scan every element of a huge array.
 */
export function shapeOk(root: unknown): boolean {
  const stack: { v: unknown; depth: number }[] = [{ v: root, depth: 0 }];
  while (stack.length > 0) {
    const { v, depth } = stack.pop()!;
    if (typeof v === 'string') {
      if (v.length > MAX_STRING) return false;
    } else if (Array.isArray(v)) {
      if (depth > MAX_DEPTH || v.length > MAX_NESTED_ARRAY) return false;
      for (const item of v) stack.push({ v: item, depth: depth + 1 });
    } else if (v !== null && typeof v === 'object') {
      if (depth > MAX_DEPTH) return false;
      const keys = Object.keys(v);
      if (keys.length > (depth === 0 ? MAX_ROOT_KEYS : MAX_OBJECT_KEYS)) return false;
      for (const k of keys) {
        if (FORBIDDEN.has(k) || k.length > MAX_KEY) return false;
        const child = (v as Record<string, unknown>)[k];
        if (depth === 0 && Array.isArray(child)) {
          const cap = (ROW_CAPS as Record<string, number>)[k];
          if (cap === undefined || child.length > cap) return false;
          for (const item of child) stack.push({ v: item, depth: 2 });
        } else {
          stack.push({ v: child, depth: depth + 1 });
        }
      }
    }
  }
  return true;
}
