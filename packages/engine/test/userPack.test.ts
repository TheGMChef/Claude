import { describe, expect, it } from 'vitest';
import { validateUserPack } from '../src/userPack';
import { npcPack } from './fixtures/npc-pack';

const userYaml = `
kind: table
id: user.npc.quirk
entries:
  - text: hums sea shanties
  - text: collects buttons
---
kind: generator
id: user.npc
title: My NPC
fields:
  role: { table: test.npc.role }
  quirk: { table: quirk }
display: '{role|cap}, {quirk}'
`;

describe('validateUserPack', () => {
  it('validates a YAML string in the user namespace', () => {
    const res = validateUserPack(userYaml, [npcPack]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pack.id).toBe('user');
    expect(res.pack.version).toBe('0');
    expect(Object.keys(res.pack.tables)).toEqual(['user.npc.quirk']);
    expect(res.pack.generators['user.npc']?.fields).toEqual({
      role: { table: 'test.npc.role' },
      quirk: { table: 'user.npc.quirk' },
    });
  });

  it('rejects ids outside the user namespace with one namespace error naming the id', () => {
    const res = validateUserPack(`
kind: table
id: fantasy.npc.want
entries:
  - text: to steal the crown
`);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.code).toBe('namespace');
    expect(res.errors[0]?.message).toContain('fantasy.npc.want');
  });

  it('returns a schema error for malformed YAML and never throws', () => {
    const run = () => validateUserPack('kind: table\nid: [unclosed\n  entries: {');
    expect(run).not.toThrow();
    const res = run();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.every((e) => e.code === 'schema')).toBe(true);
  });

  it('returns compile errors (schema, unresolved refs) instead of throwing', () => {
    const res = validateUserPack({
      kind: 'table',
      id: 'user.t.x',
      entries: [{ text: '{user.t.missing}' }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.map((e) => e.code)).toEqual(['unresolved-ref']);
    for (const bad of [null, 42, 'just a string', [1, 2]]) {
      const r = validateUserPack(bad as unknown as object);
      expect(r.ok).toBe(false);
    }
  });

  it('accepts a single document object, an array of documents, and { manifest, docs }', () => {
    const table = { kind: 'table', id: 'user.t.a', entries: [{ text: 'a' }] };
    expect(validateUserPack(table).ok).toBe(true);
    expect(validateUserPack([table]).ok).toBe(true);
    const res = validateUserPack({
      manifest: { id: 'user', version: '3', title: 'Mine' },
      docs: [table],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pack.version).toBe('3');
  });
});
