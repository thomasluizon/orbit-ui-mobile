# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web`, `apps/mobile` (Android, iPhone and iPad), `apps/desktop` (Tauri webview shell), `packages/shared`. Siblings `orbit-api`, `orbit-landing-page` and each workspace carry their own `CLAUDE.md`; this root holds cross-cutting rules. **`.claude/docs-registry.md` lists every other doc and when to read it.**

## Maximum implementation (overrides global rule 4, "surgical changes")

Fix anything broken, stale, or wrong that you find in the same PR; never call it "out of scope" or "pre-existing." Exception: `/audit-*` reports against its rubric and does not fix mid-pass. Do everything yourself (MCP servers, CLIs, APIs); involve me only when no other way exists.

## The workflow (D1-D9)

Tickets live in the private `thomasluizon/orbit-tickets` repository (D1); exactly one `repo:ui`, `repo:api`, or `repo:landing` label routes each one. The ticket is the prompt (D2). One ticket = one repo = one coherent, independently mergeable PR (D4); file and line estimates are planning signals only. Cross-repo work uses an API ticket blocking a UI ticket. `/orchestrate <ticket-reference>` takes exactly one `ORB-N` or `#N` ticket (D5).

## Cross-platform parity (MANDATORY)

Every change lands in BOTH `apps/web` AND `apps/mobile` in the same task: logic, features, behavior and error handling identical, reverts included. Allowed differences: platform adapters (BFF vs direct API, cookie vs SecureStore, shadcn vs React Native StyleSheet, Radix Primitives vs rn-primitives with one API shape, next-intl vs i18next) and the layout-shell divergence `DESIGN.md` enumerates (navigation chrome, command palette and keyboard shortcuts, hover on that chrome). Everything below the shell stays parity-bound. i18n keys land in `en.json` AND `pt-BR.json` in the same edit. `PR Metadata` fails a one-sided UI change; the escape hatch is `parity:exempt` with a one-line PR-body justification naming the adapter or divergence.

## Code standards

ESLint `local/*`, `guards.yml` and Roslyn `ORBIT0001..0005` enforce the mechanical rules; trust the gates. Judgement rules:

1. **Root cause over workarounds.** No defensive branch for a problem owned upstream; an unavoidable one gets a one-line WHY comment linking the issue.
2. **Delete unused code immediately.** No "just in case" exports, dead branches or stubs.
3. **No premature abstraction.** Extract on the third real use.
4. **Function size.** Soft cap ~50 lines and ~3 nesting levels, hard cap ~100.
5. **Error handling at boundaries only.** Validate user input and external APIs, trust your types inside, never swallow an error.
6. **Naming.** Descriptive, no abbreviations, never `data`/`info`/`temp`/`obj`/`helper`/`util` as a final name.
7. **DRY at the right level.** Cross-app code goes to `packages/shared`, cross-component to `apps/<platform>/components/`, never for one caller.
8. **Never assume an external interface.** Confirm a field, flag, exit code or response shape from a CLI, API or library you did not write against the real response or the installed source, never memory or `--help`. Never write the fixture that agrees with a guess; cannot confirm it, do not read it. The PR body carries the evidence (`review-and-audit.md` rule 13). Nothing writes inside `node_modules`; `node tools/check-dependency-edits.mjs` proves the tree matches the lockfile.
9. **Simplest implementation** that fully meets the current requirements.
10. **Grow the system in layers.** Start from the smallest version that works end to end, and never trade a working product for unfinished complexity.
11. **Use the dependencies already here**, then an established library, before you write your own.

## Security & contracts

Web cookie is httpOnly + sameSite strict + secure; mobile tokens live in SecureStore, never AsyncStorage. Contract types live in `packages/shared/src/types/*` (Zod); never invent a field the API does not return. Shared/DTO changes are **append-only and deploy-API-first**: add optional fields, never rename, remove or retype a field old mobile clients still read. Breaking changes use expand-contract plus the `AppConfig.MinSupportedVersion` gate, raised only once the carrying build is live in the Play fleet (#210).

## Brand & design

"Orbit" and "Astra" are never translated. Read `BRAND.md` before brand, copy, positioning or design-direction work. Read `DESIGN.md` before any frontend work, and the `design/canvas/` drawing for your surface (the granted export). Precedence is the `DESIGN.md` D42 ladder: `## Information architecture` and `## Bans` outrank every drawing, and a drawing outranks `DESIGN.md` prose. **No decorative glow and no gradient wash.** `--primary` is fill/graphic only, `--primary-soft` accent text.

## Git workflow

- Backend support: a paired, cross-linked `orbit-api` PR in the same task.
- Branches `feature/`|`fix/`|`chore/`; `main` is protected; squash-merge only; never `--no-verify`/`--no-gpg-sign`; never reuse a squash-merged branch.
- Backport shipping fixes from long-lived branches.
- **Admin merge is forbidden except inside the `/merge-prs` skill after the owner invokes it** for an approved frozen PR set, with only `gh pr merge --admin --squash --match-head-commit <sha>`. Outside it, STOP and ask the owner. Never use `PUT /repos/{owner}/{repo}/pulls/{number}/merge` or GraphQL `mergePullRequest`.
- Pullfrog, not the writer session, reviews every PR in GitHub Actions. Its `pullfrog-approval` check is required on `main` in both code repositories; no PR changes its instructions. Fix the code when it is red.

## Tooling

- Tools follow `tools/CONVENTIONS.md`, cataloged in `tools/README.md`. After you change `tools/**` or `.claude/**`, RUN `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`.
- Testing: Vitest unit and behavior tests for every feature, no new E2E against prod. `TESTING.md` is the catalog.
- **Research reports do not live in this repo**: they go stale silently, then get cited as authority. Durable knowledge is an ADR in the brain vault.
