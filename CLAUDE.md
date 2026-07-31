# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web`, `apps/mobile` (Android-only), `packages/shared`. Sibling repos worked from this session: `orbit-api` + `orbit-landing-page`.

Working in `orbit-api` or `orbit-landing-page`? Read that repository's `CLAUDE.md` first.

Each workspace has a scoped `CLAUDE.md` that loads when you touch its files; per-stack detail lives there. This root holds only cross-cutting Orbit rules.

## Maximum implementation (overrides global rule 4, "surgical changes")

While building or fixing, see something broken, stale, or wrong? Fix it immediately, in the same PR. Never report it as "out of scope" or "pre-existing." Exception: the review and audit skills (`/pr-review`, `/audit-*`) stay scoped to their own rubric; they report findings, they don't remediate mid-pass. Do everything in your power yourself (MCP servers, CLIs, APIs); only involve me when there is genuinely no way for you to do it.

## The workflow (D1-D9)

Linear is the source of truth for product work in this repo and orbit-api; GitHub Issues holds orbit-landing-page, infra chores, and Dependabot (D1). The ticket is the prompt (D2); one ticket = one repo = one reviewable PR, target under 400 lines (D4), and cross-repo work uses an API ticket blocking a UI ticket. The worker engine and its engine-specific model tiers live in `.claude/orchestrator.json` (D5); a `visible-effect` ticket needs final screenshots, a critique artifact, and test output before In Review (D7). `RENDER-CORRECTNESS.md` defines the bounded self-critique after capture. Invoke `tools/` scripts through their skills or agents; after `/next`, run `/orchestrate ORB-N --only`. `/next` is gated by `.claude/hooks/forbid-raw-repo-tool-surfacing.mjs`; appeals stay inline, one per command.

The session always opens in orbit-ui-mobile (D17); the orchestrator spawns worktrees into whichever repo the ticket targets. `AGENTS.md` (repo root) is Codex's entry doc: the worker contract plus `## Code Review Rules` (D26/D27). It DEFERS to this CLAUDE.md for conventions; change behaviour here, never there.

## Cross-platform parity (MANDATORY)

Every change lands in BOTH `apps/web` AND `apps/mobile` in the same task: logic, features, behavior, and error handling identical; reverts included. Allowed differences: platform adapters only (BFF vs direct API, cookie vs SecureStore, shadcn vs NativeWind, next-intl vs i18next). i18n keys land in `en.json` AND `pt-BR.json` in the same edit. The Cross-Platform Parity CI job (`guards.yml`) fails a one-sided UI change (escape hatch: the `parity:exempt` label); the `parity-checker` subagent flags drift in-session.

## Code standards

Eight judgement rules, applied everywhere. The mechanically checkable standards (no `any`, no `console.log`, the comment policy, the dash and copy bans) are enforced by ESLint `local/*`, the `guards.yml` jobs, and Roslyn `ORBIT0001..0005` in orbit-api. Trust them rather than re-checking by eye.

1. **Root cause over workarounds.** No fallbacks or defensive branches for a problem that belongs to an upstream config, type, or util. A genuinely unavoidable workaround gets a one-line WHY comment linking the issue.
2. **Delete unused code immediately.** No "just in case" exports, dead branches, or stub functions.
3. **No premature abstraction.** Extract on the third real use, not the second.
4. **Function size & nesting.** Soft cap ~50 lines / ~3 nesting levels; hard cap ~100. Beyond means split.
5. **Error handling at boundaries only.** Validate at trust boundaries (user input, external APIs); inside, trust your types. Never swallow errors silently.
6. **Naming.** Descriptive, no abbreviations, never `data`/`info`/`stuff`/`temp`/`obj`/`helper`/`util` as a final name.
7. **DRY at the right level.** Cross-app duplication goes to `packages/shared`; cross-component to `apps/<platform>/components/`; don't lift to shared for one caller.
8. **Never assume an external interface.** Confirm any field, flag, exit code, or response shape from a CLI, API, or library you didn't write by reading the real response or the installed source. Not memory, not `--help`, not what it should obviously be. Never write the fixture that agrees with a guess. Can't confirm it? Don't read it.

## Security & contracts

Auth: web cookie is httpOnly + sameSite strict + secure; mobile tokens live in SecureStore, never AsyncStorage. API contract types live in `packages/shared/src/types/*` (Zod); never invent a field the API doesn't return. Shared/DTO changes are **append-only and deploy-API-first**: add optional fields; never rename/remove/retype a field old mobile clients still read (mobile lags via the Play store). Breaking changes use expand-contract plus the `AppConfig.MinSupportedVersion` gate; raise it only after the carrying build is live in the Play fleet (#210). `/pr-review` runs the backward-compat guard (#206); the `contract-aligner` subagent flags endpoint drift.

## Brand & design

"Orbit" and "Astra" are never translated. `DESIGN.md` (repo root) is authoritative for all UI: the **de-decorated** navy-violet orbital anchor (#539 freeze, 2026-07-17), semantic tokens only, an **enumerated** spacing scale, mobile-first 412px shell. **No decorative glow and no gradient wash anywhere**: identity is carried by the orbital logo, the Astra glyph, and ring indicators. `--primary` is fill/graphic only, `--primary-soft` is accent text. Read it before any frontend work; apply the `impeccable` skill when shaping or reviewing a surface.

## Conventions & tooling

- `orbit-api` is a sibling repo: update it in the same task when a feature needs backend support. Separate git histories, branches, and PRs.
- Tools follow `tools/CONVENTIONS.md`; catalog and lockstep contract: `tools/README.md`. `node tools/check-lockstep.mjs` enforces the twin set; only justified manifest fingerprints may differ, unreadable twins fail, and the JavaScript twin is byte-exact.
- Always-loaded context is budgeted by `tools/context-budget.json`; run `node tools/check-context-budget.mjs --check` after editing this file or `.claude/rules/`, with `context:reseed` reserved for deliberate growth.
- Harnesses must execute: `node tools/test-tools.mjs` covers every tool and `node .claude/hooks/test-hooks.mjs` covers hooks and agent frontmatter; `Harness Execution` runs both for `tools/**` or `.claude/**` changes. Review-only evidence is insufficient (rubric dimension 15).
- Git: one feature/fix per PR (cross-repo work opens paired PRs, cross-linked); branches `feature/`|`fix/`|`chore/`; `main` is protected (no direct or force push, enforced by the `git-guardrails` hook); squash-merge only; never `--no-verify`/`--no-gpg-sign`; never reuse a squash-merged branch. **Never an admin merge in any shape**: no `gh pr merge --admin`, no direct `PUT /repos/{owner}/{repo}/pulls/{number}/merge`, no direct GraphQL `mergePullRequest`. Naming the raw API calls is deliberate; banning only the flag leaves both API paths open. The override is Thomas's alone: if a merge genuinely needs one, STOP and ask him to merge it.
- Session act-time hooks live in `.claude/settings.json`; `node .claude/hooks/test-hooks.mjs` is their proof (D6, D22).
- Orca worktree setup runs `npm install && node tools/orca-web-port.mjs --setup` under this repository's run-by-default setup policy. The hook assigns a deterministic web port in the 3100-4099 window and records it in the ignored `.orca/web-port`; `node tools/orca-web-port.mjs` reports it. Root stays on 3000. The database and API remain shared on 5432 and 5000.
- Testing: Vitest unit tests only; every feature needs behavior tests. The only sanctioned E2E against prod is the post-deploy web smoke suite; a separate hermetic web visual-regression gate (`.github/workflows/visual.yml`, web-only by locked decision) screenshots four surfaces against a local mock orbit-api at PR time. Configs live in each workspace. `TESTING.md` (repo root) is the suite catalog + how to write a test here.
Skill behavior lives in each command's description; `claude-review.yml` carries the CI verdict (D25) and the Codex cloud reviewer is steered by `AGENTS.md` (D26).

## Agent tool scoping

- Parenthesized `Bash(...)` specifiers in agent frontmatter fail open; `.claude/hooks/test-hooks.mjs` is the gate.
- Agent hook placement and shell allowlist guidance live in `.claude/playbooks/context-engineering.md`.

## Docs registry

Grep a doc's `At a glance` header before loading the whole file.

| Doc | Purpose |
|---|---|
| `DESIGN.md` | Authoritative UI spec; read before frontend work. |
| `RENDER-CORRECTNESS.md` | Single authority for the bounded screenshot self-critique on `visible-effect` tickets, and the seed fixture every vision pass needs. |
| **The D1..D42 decision register** | In the brain vault: `2 Areas/20-29 Orbit Engineering/Decisions/The Orbit workflow decision register (D1 to D42).md`. |
| `AGENTS.md` | Codex's entry doc: the worker contract + `## Code Review Rules`. Defers to this CLAUDE.md. |
| `FEATURES.md` | Hand-maintained capability catalogue holding the Free/Trial/Pro/Yearly gating the arch map does not. Kept honest by `/pr-review` rubric #14, not by generation. |
| `TESTING.md` | How to write tests here + the catalog of every suite. |
| `architecture.json` / `architecture.html` | Generated architecture map. What an agent reads INSTEAD of exploring the codebase. |
| `tools/context-budget.json` | Shrink-only byte baseline for always-loaded context; also guards sibling `@` imports and unconditional rules files. |
| `.claude/calibration.json` | Dated worker-model calibration stamp, max 90 days old. |
| `.claude/rules/core.md` | The judgement that auto-loads on EVERY turn. Additions here are expensive; a rule earns a place only if no skill invocation reliably precedes it. |
| `.claude/playbooks/` | On-demand judgement no gate can check. Read `context-engineering.md` before authoring agent context. |
| `.claude/manifests/surfaces.json` | Generated visual-surface inventory; owned by `tools/surface-manifest.mjs`. |
| `tools/README.md` | Tool catalog, collisions, lockstep contract. |

When you change a doc, update its `At a glance` header and this registry in the same edit.

**Research reports do not live in this repo.** Dossiers here go stale silently, then get cited as authority long after their prices and versions expire. Durable knowledge lives in the brain vault as ADRs (`brain/2 Areas/20-29 Orbit Engineering/Decisions/`); `/deep-research` writes there, never here.
