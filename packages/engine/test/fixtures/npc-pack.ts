import { parseAllDocuments } from 'yaml';
import { compileDocs } from '../../src/compile';
import { loadPacks } from '../../src/library';
import type { CompiledPack } from '../../src/schema';
import cultures from './npc-pack/cultures.yaml?raw';
import npc from './npc-pack/npc.yaml?raw';
import tables from './npc-pack/tables.yaml?raw';

const files: Record<string, string> = {
  'cultures.yaml': cultures,
  'npc.yaml': npc,
  'tables.yaml': tables,
};

const docs = Object.entries(files).flatMap(([file, src]) =>
  parseAllDocuments(src).map((d) => ({ file, data: d.toJS() as unknown })),
);

const compiled = compileDocs({ id: 'test', version: '1', title: 'Test pack' }, docs);
if (compiled.errors.length > 0) {
  throw new Error(
    `npc-pack fixture does not compile:\n${compiled.errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`,
  );
}

export const npcPack: CompiledPack = compiled.pack;
export const lib = loadPacks([npcPack]);
