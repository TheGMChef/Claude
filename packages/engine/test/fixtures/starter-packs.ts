// Compiled by vitest.global-setup.ts (R25) before tests or benches run; dist/ is gitignored.
import coreSrc from '../../../content-core/dist/core.json?raw';
import fantasySrc from '../../../content-fantasy/dist/fantasy.json?raw';
import { loadPacks } from '../../src/library';
import type { CompiledPack } from '../../src/schema';

export const corePack = JSON.parse(coreSrc) as CompiledPack;
export const fantasyPack = JSON.parse(fantasySrc) as CompiledPack;
export const lib = loadPacks([corePack, fantasyPack]);
