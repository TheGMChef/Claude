# Security

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Threat model

Prep Desk is a static, offline-first PWA. There are no accounts, no server of ours, no analytics and no network calls at runtime: after the first load the service worker serves everything, and all data stays in the browser's own storage on the device. Content packs ship as compiled JSON inside the app.

What that leaves:

- **Our dependencies and build chain.** Code we ship (React, react-router, zod, yaml, workbox-window, fonts) and code that builds it (Vite, Workbox, ESLint, Vitest). A compromised or vulnerable package is the most likely way in.
- **Untrusted input inside the app.** Share codes and user packs a GM pastes or imports are parsed by the engine and must be treated as hostile (validated by zod, no `eval`, no HTML injection). That is code-level work, covered by tests and review rather than this page.
- **Our CI.** A workflow that could be tricked into running untrusted code with write access or secrets.

Out of scope: server-side attacks (there is no server), account takeover (there are no accounts).

## What CI checks

| Check                  | Where                                               | Fails on                                                                         |
| ---------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Dependency audit       | `ci.yml` verify job                                 | any moderate, high or critical advisory not waived below                         |
| License gate           | `ci.yml` verify job, `scripts/licenses.mjs --check` | a shipped package outside the allowlist, or `THIRD-PARTY-NOTICES.md` out of date |
| Pinned actions         | `.github/workflows/*.yml`                           | (by construction) every action is pinned to a full commit SHA                    |
| Least-privilege tokens | `permissions: contents: read` everywhere            | nothing gets write access except CodeQL's `security-events: write`               |
| Dependabot             | `.github/dependabot.yml`                            | opens weekly grouped PRs for npm and Actions                                     |
| CodeQL                 | `.github/workflows/codeql.yml`                      | JavaScript/TypeScript code scanning on push, PR and weekly                       |

Workflows use no secrets and never `pull_request_target`, so a pull request from a fork runs with a read-only token. CodeQL runs on pushes and pull requests in a public repository. Set the repository variable `ENABLE_CODEQL` to `true` to also run the weekly scan, or, on a private repository, once code scanning is available there.

Production licenses are listed in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md). Regenerate it with `node scripts/licenses.mjs` after changing dependencies. To allow a new license, add its SPDX id to `ALLOWED` in the script with a note in the pull request on why it is compatible.

## Dependency advisories

`pnpm audit` must report nothing except the waivers listed here. CI runs `pnpm audit --audit-level moderate` in the verify job, so any unwaived moderate, high or critical advisory fails the build. Low advisories are reported but do not fail it; fix or waive them anyway.

When an advisory appears:

1. Upgrade the package, or the parent that pulls it in. This is almost always the answer.
2. If the parent's range blocks the fix, add a scoped `pnpm.overrides` entry (`parent>child`) and check that lint, tests, build and e2e behave the same. Record it in the overrides table below.
3. Only if no fix exists, or the code is provably unreachable from untrusted input, add a waiver: put the GHSA id in `pnpm.auditConfig.ignoreGhsas` in the root `package.json` **and** add a row to the waivers table with a written reason and a review-by date no more than three months out. A waiver without a row here is not allowed. On the review date, remove the waiver or renew it with a fresh reason.

### Waivers (`pnpm.auditConfig.ignoreGhsas` in the root `package.json`)

| Advisory            | Package         | Why it is waived                                                                                                                                                                                                                                                                                                                                      | Review by  |
| ------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| GHSA-gcqx-w48m-w2h4 | deepmerge 4.3.1 | No patched version exists. It is reached only through `workbox-build > @rollup/plugin-node-resolve` while the service worker is built. It runs at build time, is never bundled into the app, and only merges our own build configuration, so there is no untrusted input. Drop the waiver when a fixed deepmerge or a workbox-build without it ships. | 2027-02-09 |

### Overrides (`pnpm.overrides` in the root `package.json`)

These force a patched version outside the range the parent package asks for. Both were checked: `pnpm lint` reports the same results, and the service worker precache manifest is identical.

| Override                                                 | Advisory            | Why                                                                                                                               | Remove when                                              |
| -------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `@typescript-eslint/typescript-estree>minimatch` ^11.0.5 | GHSA-g3hv-75wg-m249 | typescript-estree 8.72 (latest) asks for minimatch ^10.2.2; the fix is 11.0.1. Lint-time only.                                    | typescript-estree's own range allows minimatch >= 11.0.1 |
| `workbox-build>glob` ^14.0.4                             | GHSA-3g3m-2fjr-6pw4 | workbox-build 7.4.1 (latest) asks for glob ^11; the fix is 14.0.2. Build-time only; workbox calls only `globSync(pattern, opts)`. | workbox-build's own range allows glob >= 14.0.2          |
