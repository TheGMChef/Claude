export type Modifier = { kind: 'cap' } | { kind: 'a' } | { kind: 'or'; fallback: string };

export type Slot =
  | { kind: 'table'; ref: string }
  | { kind: 'ctx'; path: string }
  | { kind: 'gen'; generator: string; field: string }
  | { kind: 'name'; part: 'full' | 'given' | 'family' };

export type TemplateAst = Array<string | { slot: Slot; mods: Modifier[] }>;
