# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web` (Next.js 16), `apps/mobile` (Expo SDK 57, Android-only), `packages/shared`. Sibling repos worked from this session: `orbit-api` (.NET 10 / EF Core / MediatR CQRS) + `orbit-landing-page` (Astro 6 + Tailwind v4).

<!-- Sibling guidance lives in each repo; it loads here because Orbit sessions always launch from orbit-ui-mobile. @-imports load in full every session and survive /compact. -->
@../orbit-api/CLAUDE.md
@../orbit-landing-page/CLAUDE.md

Each workspace has a scoped `CLAUDE.md` that loads when you touch its files — per-stack detail lives there. This root holds only cross-cutting Orbit rules.

## Maximum implementation (overrides global rule 4, "surgical changes")

While building or fixing, see something broken, stale, or wrong? Fix it immediately, in the same PR — never report it as "out of scope" or "pre-existing." Exception: the review and audit skills (`/pr-review`, `/audit-*`) stay scoped to their own rubric — they report findings, they don't remediate mid-pass. Do everything in your power yourself (MCP servers, CLIs, APIs); only involve me when there is genuinely no way for you to do it.

## Cross-platform parity (MANDATORY)

Every change lands in BOTH `apps/web` AND `apps/mobile` in the same task — logic, features, behavior, and error handling identical; reverts included. Allowed differences: platform adapters only (BFF vs direct API, cookie vs SecureStore, shadcn vs NativeWind, next-intl vs i18next). i18n keys land in `en.json` AND `pt-BR.json` in the same edit. The `parity-nudge` hook + `parity-checker` subagent flag drift.

## Code standards

Ten rules, applied everywhere. The checkable ones (3, 4, 5, plus the em-dash and hardcoded-brand-color bans) are enforced by gates — ESLint `local/*` + the `.claude/hooks/forbid-*` hooks, Roslyn `ORBIT0001` in orbit-api — so trust them rather than re-checking by eye; the rest need judgment.

1. **Root cause over workarounds.** No fallbacks or defensive branches for a problem that belongs to an upstream config, type, or util. A genuinely unavoidable workaround gets a one-line WHY comment linking the issue.
2. **Delete unused code immediately.** No "just in case" exports, dead branches, or stub functions.
3. **No `any`.** Use `unknown` with narrowing; no `as any` / `as unknown as X`. (lint-enforced)
4. **No `console.log` in production code.** Use the logger or don't log. (lint-enforced)
5. **Comments — strict policy** (lint-enforced via `local/no-comments`): only JSDoc on exports, a WHY comment linking an issue/PR/doc URL, or tooling directives. Everything else is stripped — rename or extract instead.
6. **No premature abstraction.** Extract on the third real use, not the second.
7. **Function size & nesting.** Soft cap ~50 lines / ~3 nesting levels; hard cap ~100. Beyond means split.
8. **Error handling at boundaries only.** Validate at trust boundaries (user input, external APIs); inside, trust your types. Never swallow errors silently.
9. **Naming.** Descriptive, no abbreviations, never `data`/`info`/`stuff`/`temp`/`obj`/`helper`/`util` as a final name.
10. **DRY at the right level.** Cross-app duplication → `packages/shared`; cross-component → `apps/<platform>/components/`; don't lift to shared for one caller.

## Security & contracts

Auth: web cookie is httpOnly + sameSite strict + secure; mobile tokens live in SecureStore, never AsyncStorage. API contract types live in `packages/shared/src/types/*` (Zod) — never invent a field the API doesn't return. Shared/DTO changes are **append-only and deploy-API-first**: add optional fields; never rename/remove/retype a field old mobile clients still read (mobile lags via the Play store). Breaking changes use expand-contract plus the `AppConfig.MinSupportedVersion` gate — raise it only after the carrying build is live in the Play fleet (#210). `/pr-review` runs the backward-compat guard (#206); the `contract-aligner` subagent flags endpoint drift.

## Brand & design

"Orbit" and "Astra" are never translated. `DESIGN.md` (repo root) is authoritative for all UI — navy-violet orbital anchor, semantic tokens only (`--bg`, `--bg-elev`, `--fg-1..4`, `--primary`, `--primary-rgb`, `--gradient-header`, ...), mobile-first 412px shell. Read it before any frontend work; apply the `impeccable` skill when shaping or reviewing a surface.

## Conventions & tooling

- `orbit-api` is a sibling at `C:\Users\thoma\Documents\Programming\Projects\orbit-api`; update it in the same task when a feature needs backend support. Separate git histories, branches, and PRs.
- Never create an `AGENTS.md` — opencode reads this CLAUDE.md natively; an AGENTS.md would shadow it.
- `.opencode/agents/*.md` are thin pointers to the `.claude/agents/*.md` bodies — when adding an agent, create BOTH. Hooks and memory are Claude-Code-only machinery (inert under opencode).
- C# LSP for orbit-api is wired via `.mcp.json` — the Roslyn-backed CWM.RoslynNavigator MCP server (install once: `dotnet tool install -g CWM.RoslynNavigator`) pointed at orbit-api's `Orbit.slnx`; copy from `.claude/mcp.json.example`.
- Reusable agent scripts live in `tools/` (`agent-review`, the merge-sweep scripts) under the `tools/CONVENTIONS.md` contract; build a new one with `/make-tool` once you have run the same incantation twice; a one-off stays in the scratchpad.
- Git: one feature/fix per PR (cross-repo work opens paired PRs, cross-linked); branches `feature/`|`fix/`|`chore/`; `main` is protected (no direct or force push — enforced by the `git-guardrails` hook); squash-merge only; never `--no-verify`/`--no-gpg-sign`; never reuse a squash-merged branch.
- A real git-level `pre-commit` hook (lefthook, root `lefthook.yml`) runs `npx eslint --fix` on staged `apps/web` + `packages/shared` files only (never `apps/mobile`, which keeps `expo lint`), re-staging autofixes; it self-installs via the root `prepare` script on `npm install`/`npm ci` (resilient `lefthook install || true`, a no-op in CI/Vercel when `.git`/the binary is absent), so a fresh clone needs no extra step. This is the git layer — orthogonal to the `.claude/hooks/` Claude-Code/opencode engine.
- Testing: Vitest unit tests only; every feature needs behavior tests. The only sanctioned E2E is the post-deploy web smoke suite. Configs live in each workspace. `TESTING.md` (repo root) is the suite catalog + how to write a test here.
- `/pr-review` is the canonical local diff review (orchestrates security-reviewer / contract-aligner / parity-checker / i18n-syncer + the backward-compat guard).
- `/commit-sweep` is the report-only cross-commit, cross-repo regression sweep over a window of recent `main` commits in BOTH repos (default last 10, or `--since <when>`): the backstop for gotchas a per-diff `/pr-review` or a whole-repo `/audit-*` structurally miss because PRs merge in isolation. Runs nightly via `.github/workflows/commit-sweep.yml` and on demand as `/commit-sweep`.

## Docs registry

Grep a doc's `At a glance` header before loading the whole file.

| Doc | Purpose |
|---|---|
| `DESIGN.md` | Authoritative UI spec: navy-violet anchor, semantic tokens, 412px shell. |
| `FEATURES.md` | Code-derived, gating- and platform-aware map of every capability. |
| `WORKFLOW.md` | Path-picking guide (tiny bug / real bug / medium feature / multi-issue). |
| `TESTING.md` | How to write tests here + the catalog of every suite and what each proves. |
| `research.md` | Agentic-harness research + the locked harness design decisions. |
| `.claude/research/*` | Deep-research dossiers behind the harness (memory model, env overhaul, opencode/GLM, upgrade plan). |

When you change a doc, update its `At a glance` header and this registry in the same edit.

## Path-picking & delegation

`WORKFLOW.md` (repo root) is the path-picking guide (tiny bug / real bug / medium feature / multi-issue) — read it before non-trivial work. Delegate independent/heavy work by default (3 concurrent cap; `Explore` for audits; paired worktrees for multi-issue).
