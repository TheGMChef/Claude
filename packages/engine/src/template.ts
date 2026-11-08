import { ContentError } from './errors';

export type Modifier = { kind: 'cap' } | { kind: 'a' } | { kind: 'or'; fallback: string };

export type Slot =
  | { kind: 'table'; ref: string }
  | { kind: 'ctx'; path: string }
  | { kind: 'gen'; generator: string; field: string }
  | { kind: 'name'; part: 'full' | 'given' | 'family' };

export type TemplateAst = Array<string | { slot: Slot; mods: Modifier[] }>;

function fail(message: string): never {
  throw new ContentError('schema', message, '', '');
}

function parseModifier(raw: string, text: string): Modifier {
  const seg = raw.trim();
  if (seg === 'cap') return { kind: 'cap' };
  if (seg === 'a') return { kind: 'a' };
  if (seg.startsWith('or:')) return { kind: 'or', fallback: seg.slice(3).trim() };
  return fail(`unknown modifier "${seg}" in template "${text}"`);
}

function parseSlot(raw: string, text: string): Slot {
  const body = raw.trim();
  if (body === '') return fail(`empty slot in template "${text}"`);
  if (body.startsWith('ctx.')) {
    const path = body.slice(4);
    if (path === '') return fail(`empty ctx path in template "${text}"`);
    return { kind: 'ctx', path };
  }
  if (body.startsWith('gen:')) {
    const spec = body.slice(4);
    const dot = spec.lastIndexOf('.');
    if (dot <= 0 || dot === spec.length - 1) {
      return fail(`gen slot needs "generator.field" in template "${text}"`);
    }
    return { kind: 'gen', generator: spec.slice(0, dot), field: spec.slice(dot + 1) };
  }
  if (body === 'name') return { kind: 'name', part: 'full' };
  if (body.startsWith('name:')) {
    const part = body.slice(5).trim();
    if (part === 'given' || part === 'family') return { kind: 'name', part };
    return fail(`unknown name part "${part}" in template "${text}"`);
  }
  return { kind: 'table', ref: body };
}

export function parseTemplate(text: string): TemplateAst {
  const ast: TemplateAst = [];
  let lit = '';
  const flush = (): void => {
    if (lit !== '') ast.push(lit);
    lit = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (ch === '\\' && (next === '{' || next === '}')) {
      lit += next;
      i += 2;
    } else if (ch === '{') {
      let body = '';
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        const c = text[j] as string;
        const n = text[j + 1];
        if (c === '\\' && (n === '{' || n === '}')) {
          body += n;
          j += 2;
        } else if (c === '}') {
          closed = true;
          break;
        } else if (c === '{') {
          return fail(`unexpected "{" inside slot in template "${text}"`);
        } else {
          body += c;
          j += 1;
        }
      }
      if (!closed) return fail(`unclosed "{" in template "${text}"`);
      const [slotPart, ...modParts] = body.split('|');
      flush();
      ast.push({
        slot: parseSlot(slotPart as string, text),
        mods: modParts.map((m) => parseModifier(m, text)),
      });
      i = j + 1;
    } else {
      lit += ch;
      i += 1;
    }
  }
  flush();
  return ast;
}

export function templateRefs(ast: TemplateAst): { tables: string[]; generators: string[] } {
  const tables = new Set<string>();
  const generators = new Set<string>();
  for (const el of ast) {
    if (typeof el === 'string') continue;
    if (el.slot.kind === 'table') tables.add(el.slot.ref);
    else if (el.slot.kind === 'gen') generators.add(el.slot.generator);
  }
  return { tables: [...tables], generators: [...generators] };
}

export function findCycle(graph: Map<string, string[]>): string[] | null {
  const done = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visit = (node: string): string[] | null => {
    if (onStack.has(node)) return [...stack.slice(stack.indexOf(node)), node];
    if (done.has(node)) return null;
    onStack.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    stack.pop();
    onStack.delete(node);
    done.add(node);
    return null;
  };
  for (const key of graph.keys()) {
    const found = visit(key);
    if (found) return found;
  }
  return null;
}
