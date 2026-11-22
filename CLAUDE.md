# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web`, `apps/mobile` (Android, iPhone and iPad), `apps/desktop` (Tauri webview shell), `packages/shared`. Each workspace has its own `CLAUDE.md`. The sibling repositories are `orbit-api` and `orbit-landing-page`.

## Work

- Tickets live in `thomasluizon/orbit-tickets`. Exactly one label (`repo:ui`, `repo:api` or `repo:landing`) routes each ticket. Cross-repository work uses an API ticket that blocks a UI ticket.
- One ticket is one repository. It ships as one or more independently mergeable PRs of one behavior. Each PR body says `Tracks thomasluizon/orbit-tickets#<N>`, never `Closes`. The last PR says `Remaining: none`.
- The delivery driver (`tools/drive.mjs`, `/driver`) launches a headless worker for every code change and merges at the bar. The owner session writes no code for a ticket. Nobody uses an admin merge.
- Fix the ticket and everything the change breaks. A blocking-class bug outside the change goes to a ticket.
- Never remove features. A change never drops a production capability (a view, tab, action, setting or shortcut) unless the owner removed it explicitly. A missing feature is a defect to restore with production's behavior.
- Models: the owner session and the Pullfrog reviewer run Opus 5.5. Every worker runs `claude-sonnet-5-5` at effort high. Only the owner's words in chat change a model or an effort. A usage limit never does.
- The Pullfrog prompt lives in its console. It changes only by an owner decision.
- Copy every identifier you pass to a tool (PR number, SHA, run id, node id) from this run's output, never from memory.
- A URL slug, an anchor id, a primary nav label, or a form field's `name` or order changes only with the owner's approval.
- Rules, skills and specs state only the current instruction: no incident history, no dated story, no attributed quote, no session id, no home path, no other account or employer.
- When something is wrong, fix the instance and its cause, then report. A new guard (hook, gate or lint rule) enters only with evidence: the owner's words or a measured failure. Never ask when the answer is obvious.
- In a cleanup, assume each file is stale. It stays only with a written reason to exist.
- After a verified migration, delete the old project and cancel the old subscription. Never do it before the migration is verified.
- Every PR targets `main` in orbit-ui-mobile and orbit-api. Never ask which branch.
- The owner is the only active user. "No device runs build X" means the owner has not updated the phone yet.
- Before public launch, a production outage is not urgent. Keep the board order.

## Parity

Every change lands in `apps/web` and `apps/mobile` in the same PR: logic, features, behavior and error handling, reverts included. Allowed differences: platform adapters (BFF or direct API, cookie or SecureStore, shadcn or StyleSheet, Radix or rn-primitives, next-intl or i18next) and the layout-shell divergence that `DESIGN.md` lists. Add i18n keys to `en.json` and `pt-BR.json` in the same edit. For an allowed one-sided change, label the PR `parity:exempt` and add a `## Parity` line that names the adapter or the divergence.

## Code

1. Fix the root cause. Add no defensive branch for a problem that an upstream owner has. An unavoidable one gets a one-line WHY comment.
2. Put cross-app code in `packages/shared` and cross-component code in `apps/<platform>/components/`. Extract on the third real use.
3. Confirm a field, flag, exit code or response shape of an external interface against the real response or the installed source, never memory or `--help`. Write no fixture that agrees with a guess.

## Security and contracts

The web cookie is httpOnly, sameSite strict and secure. Mobile tokens live in SecureStore, never AsyncStorage. Contract types live in `packages/shared/src/types/*` (Zod). DTO changes are append-only and deploy the API first. Never rename, remove or retype a field that an old mobile client reads. A breaking change uses expand-contract and the `AppConfig.MinSupportedVersion` gate, which rises only when the carrying build is live in the Play fleet. Keep the locale out of auth and deep-link URLs. Gate both listing and revoking API keys behind the emailed code.

## Brand and design

"Orbit" is never translated. The `DESIGN.md` sections `Information architecture` and `Bans` outrank every drawing in `design/canvas/`, and a drawing outranks the `DESIGN.md` prose. No decorative glow and no gradient wash. `--primary` is fill and graphic only. `--primary-soft` is accent text.

## Git and tests

- Branch prefixes: `feature/`, `fix/`, `chore/`. `main` is protected. Squash only. Never use `--no-verify` or `--no-gpg-sign`. Never reuse a squash-merged branch.
- An API change that the UI needs gets a paired, cross-linked `orbit-api` PR in the same task.
- Tests are Vitest. Locally run only focused tests (`vitest related`). CI runs every full suite. After a change to `tools/`, run `node tools/test-tools.mjs --only <module>`.

## Docs

- `BRAND.md` before copy, brand or positioning work.
- `DESIGN.md` before frontend work.
- `TESTING.md` for the test catalog.
- `FEATURES.md` for the feature inventory.
- `.claude/skills/release/reference.md` for release facts.
