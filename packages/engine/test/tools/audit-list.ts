/**
 * Prints a Markdown sheet for the safety-tag audit (Content Task Protocol step 5):
 *   tsx packages/engine/test/tools/audit-list.ts <tableId-or-prefix>...
 * One row per entry: id, text, safety, stem hits, and the stem hits the entry does not carry.
 */
import coreJson from '../../../content-core/dist/core.json';
import fantasyJson from '../../../content-fantasy/dist/fantasy.json';
import { stemHits } from '../../src/safetyStems';
import type { CompiledPack } from '../../src/schema';
import { astText } from '../fixtures/content-helpers';

declare const process: { argv: string[]; exit(code: number): never };

const packs = [coreJson, fantasyJson] as unknown as CompiledPack[];
const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  console.error('usage: tsx packages/engine/test/tools/audit-list.ts <tableId-or-prefix>...');
  process.exit(1);
}

const cell = (s: string): string => s.replace(/\|/g, '\\|');
const tables = packs
  .flatMap((p) => Object.values(p.tables))
  .filter((t) => wanted.some((w) => t.id === w || t.id.startsWith(w)))
  .sort((a, b) => a.id.localeCompare(b.id));

for (const table of tables) {
  console.log(`\n## ${table.id}${table.title ? ` (${table.title})` : ''}\n`);
  console.log('| id | text | safety | stem hits | untagged hits |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const e of table.entries) {
    const text = astText(e.ast);
    const hits = stemHits(text);
    const untagged = hits.filter((h) => !e.safety.includes(h));
    console.log(
      `| ${e.id} | ${cell(text)} | ${e.safety.join(', ')} | ${hits.join(', ')} | ${untagged.join(', ')} |`,
    );
  }
}
if (tables.length === 0) console.error(`no table matches: ${wanted.join(' ')}`);
