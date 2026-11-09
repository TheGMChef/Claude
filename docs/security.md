# Security

## Dependency advisories

`pnpm audit` must report nothing except the waivers listed here. CI runs `pnpm audit --audit-level moderate` in the verify job, so any unwaived moderate, high or critical advisory fails the build. Low advisories are reported but do not fail it; fix or waive them anyway.

When an advisory appears:

1. Upgrade the package, or the parent that pulls it in. This is almost always the answer.
2. If the parent's range blocks the fix, add a scoped `pnpm.overrides` entry (`parent>child`) and check that lint, tests, build and e2e behave the same. Record it in the overrides table below.
3. Only if no fix exists, or the code is provably unreachable from untrusted input, add a waiver: put the GHSA id in `pnpm.auditConfig.ignoreGhsas` in the root `package.json` **and** add a row to the waivers table with a written reason and a review-by date no more than three months out. A waiver without a row here is not allowed. On the review date, remove the waiver or renew it with a fresh reason.

### Waivers (`pnpm.auditConfig.ignoreGhsas` in the root `package.json`)

| Advisory            | Package         | Why it is waived                                                                                                                                                                                                                                                                                                                                         | Review by  |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| GHSA-gcqx-w48m-w2h4 | deepmerge 4.3.1 | No patched version exists. It is reached only through `workbox-build > @rollup/plugin-node-resolve` while the service worker is built. It runs at build time, is never bundled into the app, and only merges our own build configuration, so there is no untrusted input. Drop the waiver when a fixed deepmerge or a workbox-build without it ships. | 2027-02-09 |

### Overrides (`pnpm.overrides` in the root `package.json`)

These force a patched version outside the range the parent package asks for. Both were checked: `pnpm lint` reports the same results, and the service worker precache manifest is identical.

| Override                                               | Advisory            | Why                                                                                                                                | Remove when                                                       |
| ------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@typescript-eslint/typescript-estree>minimatch` ^11.0.5 | GHSA-g3hv-75wg-m249 | typescript-estree 8.72 (latest) asks for minimatch ^10.2.2; the fix is 11.0.1. Lint-time only.                                     | typescript-estree's own range allows minimatch >= 11.0.1          |
| `workbox-build>glob` ^14.0.4                           | GHSA-3g3m-2fjr-6pw4 | workbox-build 7.4.1 (latest) asks for glob ^11; the fix is 14.0.2. Build-time only; workbox calls only `globSync(pattern, opts)`. | workbox-build's own range allows glob >= 14.0.2                   |
