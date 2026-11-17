import { fieldLabel } from '../../content/fields';
import { KIND_PLURALS } from '../../content/labels';
import type { RepoDeps } from '../deps';
import { listEntities } from '../repo/entities';
import { campaignName } from './markdownName';
import { ENTITY_KINDS } from '../schema';
import type { Entity } from '../schema';
import { downloadFile, exportName } from './json';

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A multi-line value as an indented continuation, so it stays inside its list item. */
const block = (s: string): string =>
  s
    .split(/\r?\n/)
    .map((l, i) => (i === 0 ? l : `  ${l}`))
    .join('\n');

function entryMarkdown(e: Entity): string {
  const lines = [`### ${oneLine(e.title)}`];
  if (e.summary.trim() !== '') lines.push('', `_${oneLine(e.summary)}_`);
  const fields = Object.entries(e.fields).filter(([, v]) => v.trim() !== '');
  if (fields.length > 0) {
    lines.push('');
    for (const [k, v] of fields) lines.push(`- **${fieldLabel(k)}:** ${block(v)}`);
  }
  if (e.body.trim() !== '') lines.push('', e.body.trim());
  return lines.join('\n');
}

/**
 * The whole Codex as one Markdown document: a section per kind, an entry per heading. Wiki links stay
 * as [[Title]], so the file opens in Obsidian-style tools with the links intact. Pure: no I/O.
 */
export function entitiesToMarkdown(name: string, entities: readonly Entity[], date: Date): string {
  const out = [
    `# ${campaignName(name)}`,
    '',
    `_Prep Desk Codex, exported ${date.toISOString().slice(0, 10)}_`,
  ];
  for (const kind of ENTITY_KINDS) {
    const of = entities
      .filter((e) => e.kind === kind)
      .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
    if (of.length === 0) continue;
    out.push('', `## ${KIND_PLURALS[kind]}`);
    for (const e of of) out.push('', entryMarkdown(e));
  }
  return `${out.join('\n')}\n`;
}

/** Download the Codex as a Markdown file. Read-only: it does not change `lastExportedAt`. */
export async function exportMarkdown(
  d: RepoDeps,
  campaign: { id: string; name: string },
): Promise<void> {
  const list = await listEntities(d, campaign.id);
  const now = new Date(d.now());
  const text = entitiesToMarkdown(campaign.name, list, now);
  downloadFile(exportName(campaign, 'md', now), new Blob([text], { type: 'text/markdown' }));
}
