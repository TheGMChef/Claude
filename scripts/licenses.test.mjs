import { describe, expect, it } from 'vitest';
import { ALLOWED, checkEntries, compareNotices, flatten, render } from './licenses.mjs';

const sample = {
  MIT: [
    { name: 'react', versions: ['18.3.1'], license: 'MIT', paths: ['/abs/react'] },
    { name: 'cookie', versions: ['1.1.1'], license: 'MIT' },
  ],
  'OFL-1.1': [{ name: '@fontsource/jetbrains-mono', versions: ['5.3.0'], license: 'OFL-1.1' }],
};

describe('licenses script', () => {
  it('flattens pnpm output to sorted name/version/license rows without local paths', () => {
    expect(flatten(sample)).toEqual([
      { name: '@fontsource/jetbrains-mono', version: '5.3.0', license: 'OFL-1.1' },
      { name: 'cookie', version: '1.1.1', license: 'MIT' },
      { name: 'react', version: '18.3.1', license: 'MIT' },
    ]);
  });

  it('allows permissive licenses, OFL for fonts and CC-BY for content', () => {
    for (const id of ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'OFL-1.1']) {
      expect(ALLOWED).toContain(id);
    }
    expect(checkEntries(flatten(sample))).toEqual([]);
  });

  it('rejects copyleft, unknown and missing licenses', () => {
    const bad = [
      { name: 'a', version: '1.0.0', license: 'GPL-3.0' },
      { name: 'b', version: '1.0.0', license: 'Unknown' },
      { name: 'c', version: '1.0.0', license: '' },
      { name: 'd', version: '1.0.0', license: 'MIT' },
    ];
    expect(checkEntries(bad).map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('accepts an SPDX OR expression when one side is allowed, not an AND with a disallowed side', () => {
    expect(checkEntries([{ name: 'x', version: '1', license: '(MIT OR GPL-3.0)' }])).toEqual([]);
    expect(checkEntries([{ name: 'y', version: '1', license: 'MIT AND GPL-3.0' }])).toHaveLength(1);
  });

  it('renders a table that lists every package once', () => {
    const md = render(flatten(sample));
    expect(md).toMatch(/^# Third-party notices/);
    expect(md).toContain('| react | 18.3.1 | MIT |');
    expect(md).toContain('| @fontsource/jetbrains-mono | 5.3.0 | OFL-1.1 |');
    expect(md).not.toContain('/abs/');
  });

  it('flags packages missing from or extra in the committed notices, tolerating version drift', () => {
    const rows = flatten(sample);
    const committed = render(rows)
      .replace('| react | 18.3.1 |', '| react | 18.3.0 |')
      .replace(/\| cookie .*\n/, '| left-pad | 1.0.0 | MIT |\n');
    const diff = compareNotices(rows, committed);
    expect(diff.missing).toEqual(['cookie']);
    expect(diff.extra).toEqual(['left-pad']);
    expect(diff.drifted).toEqual(['react']);
  });
});
