import { z } from 'zod';
import type { TemplateAst } from './template';

// ---------- Source schemas (YAML documents, one per `kind`) ----------

const Weight = z.number().positive().default(1);
const Tags = z.array(z.string()).default([]);

const EntrySrc = z.strictObject({
  text: z.string(),
  weight: Weight,
  tags: Tags,
  safety: z.array(z.string()).default([]),
});

export const TableSrc = z.strictObject({
  kind: z.literal('table'),
  id: z.string().min(1),
  title: z.string().optional(),
  tags: Tags,
  entries: z.array(EntrySrc).min(1, { message: 'a table needs at least 1 entry' }),
});

/** Part token in a name pattern: `name`, `name?` or `name?:0.3`. */
export const PATTERN_TOKEN = /^[^?:\s]+(\?(:(0(\.\d+)?|1(\.0+)?|\.\d+))?)?$/;

const NamePartsSrc = z.strictObject({
  pattern: z.array(z.string().regex(PATTERN_TOKEN)).min(1),
  parts: z.record(z.string(), z.array(z.string())),
});

export const CultureSrc = z.strictObject({
  kind: z.literal('culture'),
  id: z.string().min(1),
  name: z.string().min(1),
  genre: z.string().optional(),
  voice: z.strictObject({
    summary: z.string(),
    tips: z.array(z.string()),
  }),
  names: z.strictObject({
    given: NamePartsSrc,
    family: NamePartsSrc.optional(),
    format: z.string().optional(),
    examples: z.array(z.string()).default([]),
    exampleChance: z.number().min(0).max(1).default(0),
    banned: z.array(z.string()).default([]),
  }),
});

const FieldSourceSchema = z.union([
  z.strictObject({ table: z.string() }),
  z.strictObject({ template: z.string() }),
  z.strictObject({ name: z.enum(['full', 'given', 'family']) }),
  z.strictObject({ culture: z.string() }),
  z.strictObject({ gen: z.string() }),
  z.strictObject({
    pick: z.strictObject({ table: z.string(), count: z.number().int().positive() }),
  }),
]);

export const GeneratorSrc = z.strictObject({
  kind: z.literal('generator'),
  id: z.string().min(1),
  title: z.string(),
  fields: z.record(z.string(), FieldSourceSchema),
  display: z.string(),
});

const OddsSrc = z.strictObject({
  yes: z.number().min(0).max(100),
  extreme: z.number().min(0).max(100),
});

export const OracleSrc = z.strictObject({
  kind: z.literal('oracle'),
  id: z.string().min(1),
  odds: z.strictObject({
    certain: OddsSrc,
    likely: OddsSrc,
    even: OddsSrc,
    unlikely: OddsSrc,
    remote: OddsSrc,
  }),
  meaning: z.array(z.string()).length(2, { message: 'an oracle needs exactly 2 meaning tables' }),
});

export const DeckSrc = z.strictObject({
  kind: z.literal('deck'),
  id: z.string().min(1),
  title: z.string(),
  cards: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        text: z.string(),
        prompt: z.string().optional(),
        safety: z.array(z.string()).optional(),
      }),
    )
    .min(1, { message: 'a deck needs at least 1 card' }),
});

export const VocabularySrc = z.strictObject({
  kind: z.literal('vocabulary'),
  tags: z.array(z.string()),
});

/** The `prepdesk` key of a content package's package.json. */
export const PackManifestSrc = z.strictObject({
  id: z.string().min(1),
  version: z.string().min(1),
  genre: z.string().optional(),
  title: z.string().min(1),
});

export const DocumentSrc = z.discriminatedUnion('kind', [
  TableSrc,
  CultureSrc,
  GeneratorSrc,
  OracleSrc,
  DeckSrc,
  VocabularySrc,
]);

export type TableSource = z.input<typeof TableSrc>;
export type CultureSource = z.input<typeof CultureSrc>;
export type GeneratorSource = z.input<typeof GeneratorSrc>;
export type OracleSource = z.input<typeof OracleSrc>;
export type DeckSource = z.input<typeof DeckSrc>;
export type VocabularySource = z.input<typeof VocabularySrc>;
export type PackManifest = z.infer<typeof PackManifestSrc>;
export type DocumentSource = z.input<typeof DocumentSrc>;

// ---------- Compiled types (what the web app loads as JSON) ----------

export type FieldSource =
  | { table: string }
  | { template: TemplateAst }
  | { name: 'full' | 'given' | 'family' }
  | { culture: string }
  | { gen: string }
  | { pick: { table: string; count: number } };

export type CompiledEntry = {
  /** Stable id: `<tableId>#<index>`. */
  id: string;
  ast: TemplateAst;
  weight: number;
  tags: string[];
  safety: string[];
};

export type CompiledTable = {
  id: string;
  title?: string;
  tags: string[];
  entries: CompiledEntry[];
};

export type NameParts = {
  pattern: string[];
  parts: Record<string, string[]>;
};

export type CompiledCulture = {
  id: string;
  name: string;
  genre?: string;
  voice: { summary: string; tips: string[] };
  names: { given: NameParts; family?: NameParts; format?: string };
  examples: string[];
  /** 0..1, defaults to 0. */
  exampleChance: number;
  banned: string[];
};

export type CompiledGenerator = {
  id: string;
  title: string;
  /** Object key order IS the field order; keep it when serialising. */
  fields: Record<string, FieldSource>;
  display: TemplateAst;
};

export type Likelihood = 'certain' | 'likely' | 'even' | 'unlikely' | 'remote';

export type CompiledOracle = {
  id: string;
  odds: Record<Likelihood, { yes: number; extreme: number }>;
  meaning: string[];
};

export type CompiledDeck = {
  id: string;
  title: string;
  /** `safety`: vocabulary tags, as on table entries (I6). */
  cards: Array<{ id: string; text: string; prompt?: string; safety?: string[] }>;
};

export type CompiledPack = {
  id: string;
  version: string;
  genre?: string;
  tables: Record<string, CompiledTable>;
  cultures: Record<string, CompiledCulture>;
  generators: Record<string, CompiledGenerator>;
  oracles: Record<string, CompiledOracle>;
  decks: Record<string, CompiledDeck>;
  vocabulary: string[];
};
