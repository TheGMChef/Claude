# Security

## Dependency advisories

`pnpm audit` must report nothing except the waivers listed here.

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
