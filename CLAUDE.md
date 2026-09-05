# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web`, `apps/mobile` (Android-only), `packages/shared`. Siblings `orbit-api` and `orbit-landing-page` carry their own `CLAUDE.md`, and each workspace has a scoped one, so this root holds only cross-cutting rules.

## Maximum implementation (overrides global rule 4, "surgical changes")

Something broken, stale, or wrong while you build or fix? Fix it in the same PR; never call it "out of scope" or "pre-existing." Exception: `/audit-*` reports against its rubric, it doesn't remediate mid-pass. Do everything yourself (MCP servers, CLIs, APIs); involve me only when there is genuinely no way for you to do it.

## The workflow (D1-D9)

Every ticket lives in the private `thomasluizon/orbit-tickets` GitHub repository (D1). Exactly one `repo:ui`, `repo:api`, or `repo:landing` label routes each ticket to its code repository. The ticket is the prompt (D2); one ticket = one repo = one coherent, independently mergeable PR (D4), with file and line estimates used only as planning signals, and cross-repo work uses an API ticket blocking a UI ticket. `/orchestrate <ticket-reference>` takes exactly one migrated `ORB-N` or GitHub `#N` ticket (D5). The reviewer is never the session that wrote the code, because Pullfrog reviews every pull request from GitHub Actions.

## Cross-platform parity (MANDATORY)

Every change lands in BOTH `apps/web` AND `apps/mobile` in the same task: logic, features, behavior, and error handling identical, reverts included. Allowed differences are platform adapters (BFF vs direct API, cookie vs SecureStore, shadcn vs NativeWind, next-intl vs i18next) and a layout-shell divergence enumerated in `DESIGN.md`, limited to navigation chrome (sidebar vs tab bar), the command palette and keyboard shortcuts, and hover affordances on that shell chrome. The desktop stats rail was a fourth and is deleted (D69, 2026-08-16). Everything below the shell, including a screen, component, data flow, error path, or behavior, remains parity-bound. i18n keys land in `en.json` AND `pt-BR.json` in the same edit. The Cross-Platform Parity job in `guards.yml` fails a one-sided UI change; the escape hatch is `parity:exempt` with a one-line PR-body justification naming the applicable platform adapter or enumerated layout-shell divergence.

## Code standards

Eleven judgement rules. The mechanical ones (no `any`, no `console.log`, comments, dashes, copy) are enforced by ESLint `local/*`, `guards.yml`, and Roslyn `ORBIT0001..0005`; trust the gates rather than re-checking by eye.

1. **Root cause over workarounds.** No fallback or defensive branch for a problem owned upstream (config, type, util). An unavoidable one gets a one-line WHY comment linking the issue.
2. **Delete unused code immediately.** No "just in case" exports, dead branches, stub functions.
3. **No premature abstraction.** Extract on the third real use, not the second.
4. **Function size & nesting.** Soft cap ~50 lines / ~3 levels, hard cap ~100. Beyond means split.
5. **Error handling at boundaries only.** Validate at trust boundaries (user input, external APIs), trust your types inside, never swallow an error.
6. **Naming.** Descriptive, no abbreviations, never `data`/`info`/`stuff`/`temp`/`obj`/`helper`/`util` as a final name.
7. **DRY at the right level.** Cross-app duplication goes to `packages/shared`, cross-component to `apps/<platform>/components/`, never for one caller.
8. **Never assume an external interface.** Confirm any field, flag, exit code, or response shape from a CLI, API, or library you didn't write against the real response or the installed source: not memory, not `--help`, not what it obviously should be. Never write the fixture that agrees with a guess. Can't confirm it? Don't read it.
9. **Simplest implementation that fully meets the current requirements.** No speculative abstraction, configuration, or indirection.
10. **Grow the system in layers.** Start from the smallest version that works end to end, then add each capability on top of something that already works. Never trade a working product for unfinished complexity.
11. **Lean on the dependencies already here** before writing your own or adding a package; prefer an established, well-maintained library to reimplementing common functionality.

## Security & contracts

Web cookie is httpOnly + sameSite strict + secure; mobile tokens live in SecureStore, never AsyncStorage. Contract types live in `packages/shared/src/types/*` (Zod); never invent a field the API doesn't return. Shared/DTO changes are **append-only and deploy-API-first**: add optional fields, never rename, remove, or retype a field old mobile clients still read (mobile lags via the Play store). Breaking changes use expand-contract plus the `AppConfig.MinSupportedVersion` gate, raised only once the carrying build is live in the Play fleet (#210).

## Brand & design

"Orbit" and "Astra" are never translated. `BRAND.md` is authoritative for audience and positioning: read it before any brand, copy, positioning or design-direction work, and before ORB-30. `DESIGN.md` (repo root) is authoritative for all UI: read it before any frontend work. **`design/canvas/` is the granted Claude Design export (2026-08-25).** Read the drawing for the surface you are building, and its tokens. Precedence is a ladder, defined in `DESIGN.md` D42: `## Information architecture` and `## Bans` outrank every drawing, and below those two the drawing outranks `DESIGN.md` prose. A granted export never authorises a banned value. Never build from `design/canvas/superseded/`. **No decorative glow and no gradient wash anywhere**; identity comes from the orbital logo, the Astra glyph, and ring indicators. `--primary` is fill/graphic only, `--primary-soft` accent text.

## Conventions & tooling

- Feature needs backend support? Update the sibling `orbit-api` repo in the same task; it has its own history, branches, and PRs.
- Git: one feature/fix per PR (cross-repo work opens paired, cross-linked PRs); branches `feature/`|`fix/`|`chore/`; `main` is protected (no direct or force push, enforced by `git-guardrails`); squash-merge only; never `--no-verify`/`--no-gpg-sign`; never reuse a squash-merged branch. **Admin merge is forbidden except inside the canonical `/merge-prs` skill after Thomas explicitly invokes it for an already-approved frozen PR set.** That skill may use only `gh pr merge --admin --squash --match-head-commit <sha>` under its exact-head preflight. Outside it, STOP and ask Thomas. Direct merge APIs remain forbidden without exception: no `PUT /repos/{owner}/{repo}/pulls/{number}/merge`, no direct GraphQL `mergePullRequest`.
- Review: Pullfrog reviews every pull request in GitHub Actions and publishes `pullfrog-approval`, a required status check on `main` in both code repositories. Its review instructions live in the Pullfrog console, server-side, so no pull request can change the rules it is judged by. A red check means you fix the code.
- Tools follow `tools/CONVENTIONS.md`, cataloged in `tools/README.md`. After changing `tools/**` or `.claude/**`, RUN both harnesses: `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`. Review-only evidence is insufficient.
- Testing: Vitest unit tests only, behavior tests for every feature, no new E2E against prod. `TESTING.md` is the catalog plus how to write one.

## Docs registry

Grep a doc's `At a glance` header before loading it; update this table when a doc changes.

| Doc | Purpose |
|---|---|
| `BRAND.md` | Audience, positioning and principles; read before brand, copy, positioning or design-direction work, and before ORB-30. |
| `DESIGN.md` | UI spec; read before frontend work. |
| `design/canvas/` | The granted canvas export: 21 screens plus 166 tokens. Outranks DESIGN.md prose on how a surface looks; never over `## Information architecture` or `## Bans`. |
| `AGENTS.md` | Codex's worker entry doc; defers to this file. |
| `.claude/skills/pr-review/rubric.md` | The dimensions `/audit-code-quality` audits against; its only consumer. |
| `FEATURES.md` | The Free/Trial/Pro/Yearly gating the arch map lacks. |
| `TESTING.md` | Unit, smoke, hermetic layout guard and performance, mutation, and harness suite catalog; authoring rules, Chrome prerequisite for target geometry tests, and local Lighthouse commands and report location. |
| `architecture.json` | Generated map. Read it INSTEAD of exploring the codebase. |
| `.claude/rules/core.md` | Always-loaded judgement and D89/D90 operating-contract pointers. |
| `.claude/skills/ticket/SKILL.md` | GitHub ticket creation, labels, relations, and milestone rules. |
| `.claude/skills/orchestrate/SKILL.md` | Ticket queue, worker, review and readiness contract; D89 redesign invocation and local/cloud caps. |
| `.claude/skills/handoff/SKILL.md` | Handoff prompts with the required standing-contract block before the task. |
| `.claude/playbooks/redesign-screen.md` | Thirteen-screen D76 loop, temporary D90 suspension and required ui-skills sweep. |
| `.claude/skills/android-generate/SKILL.md` | Local APK build, and the emulator install path. Read before building or running the Android app. |
| `.claude/skills/android-release/SKILL.md` | Dispatching `android-release.yml` to a Google Play track. |
| **D1..D42 register** | Historical decision record in the brain vault: `2 Areas/20-29 Orbit Engineering/Decisions/`. Current ticket routing is defined here. |

**Research reports do not live in this repo**: they go stale silently, then get cited as authority long after they expire. Durable knowledge is an ADR in the brain vault; `/deep-research` writes there.
