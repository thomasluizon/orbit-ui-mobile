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

"Orbit" and "Astra" are never translated. `DESIGN.md` (repo root) is authoritative for all UI: the **de-decorated** navy-violet orbital anchor (#539 freeze, 2026-07-17), semantic tokens only (`--bg`, `--bg-elev`, `--fg-1..4`, `--primary`, `--primary-soft`, `--primary-rgb`, `--hairline`, ...), a base-4 spacing scale, mobile-first 412px shell. **No decorative glow and no gradient wash anywhere**: the `--gradient-header` and primary-glow tokens are deleted, identity is carried by the orbital logo, the Astra glyph, and ring indicators. `--primary` is fill/graphic only, `--primary-soft` is accent text (see the accent-split section, which the accent-AA gate is designed to assert; #539 bundle 4 builds it). Read it before any frontend work; apply the `impeccable` skill when shaping or reviewing a surface.

## Conventions & tooling

- `orbit-api` is a sibling at `C:\Users\thoma\Documents\Programming\Projects\orbit-api`; update it in the same task when a feature needs backend support. Separate git histories, branches, and PRs.
- Never create an `AGENTS.md` — opencode reads this CLAUDE.md natively; an AGENTS.md would shadow it.
- `.opencode/agents/*.md` are thin pointers to the `.claude/agents/*.md` bodies — when adding an agent, create BOTH. **The two schemas are inverted**: Claude Code `tools:` is an ALLOWLIST (absent = unavailable), opencode `permission:` is a DENYLIST (absent = GRANTED, and unmatched `permission.bash` globs default to allow). Mirroring the syntax without accounting for that silently widens the agent — deny the capabilities the Claude Code side omits. Memory is Claude-Code-only. The `.claude/hooks/*.mjs` adapters are Claude-Code-only too, but their RULES are not: `.opencode/plugin/orbit-guardrails.js` enforces the same `_lib` core in both tools (the loader globs `{plugin,plugins}/*.{ts,js}`, one level deep — so keep that file `.js`; renaming it `.mjs` to match the hooks would silently unload every opencode guardrail). The lone rule that cannot be mirrored is the agent-scoped shell allowlist — see "Agent tool scoping".
- C# LSP for orbit-api is wired via `.mcp.json` — the Roslyn-backed CWM.RoslynNavigator MCP server (install once: `dotnet tool install -g CWM.RoslynNavigator`) pointed at orbit-api's `Orbit.slnx`; copy from `.claude/mcp.json.example`.
- Reusable agent scripts live in `tools/` (`agent-review`, the merge-sweep scripts) under the `tools/CONVENTIONS.md` contract; build a new one with `/make-tool` once you have run the same incantation twice; a one-off stays in the scratchpad.
- Git: one feature/fix per PR (cross-repo work opens paired PRs, cross-linked); branches `feature/`|`fix/`|`chore/`; `main` is protected (no direct or force push — enforced by the `git-guardrails` hook); squash-merge only; never `--no-verify`/`--no-gpg-sign`; never reuse a squash-merged branch.
- A real git-level `pre-commit` hook (lefthook, root `lefthook.yml`) runs `npx eslint --fix` on staged `apps/web` + `packages/shared` files only (never `apps/mobile`, which keeps `expo lint`), re-staging autofixes; it self-installs via the root `prepare` script on `npm install`/`npm ci` (resilient `lefthook install || true`, a no-op in CI/Vercel when `.git`/the binary is absent), so a fresh clone needs no extra step. This is the git layer — orthogonal to the `.claude/hooks/` Claude-Code/opencode engine.
- Testing: Vitest unit tests only; every feature needs behavior tests. The only sanctioned E2E against prod is the post-deploy web smoke suite; a separate hermetic web visual-regression gate (`.github/workflows/visual.yml`, web-only by locked decision) screenshots four surfaces against a local mock orbit-api at PR time. Configs live in each workspace. `TESTING.md` (repo root) is the suite catalog + how to write a test here.
- `/pr-review` is the canonical local diff review (orchestrates security-reviewer / contract-aligner / parity-checker / i18n-syncer + the backward-compat guard).
- `/commit-sweep` is the report-only cross-commit, cross-repo regression sweep over a window of recent `main` commits in BOTH repos (default last 10, or `--since <when>`): the backstop for gotchas a per-diff `/pr-review` or a whole-repo `/audit-*` structurally miss because PRs merge in isolation. Runs nightly via `.github/workflows/commit-sweep.yml` and on demand as `/commit-sweep`.
- `/profile` is the on-demand, interactive web performance profiler: it wraps the chrome-devtools MCP perf tools (`performance_start_trace` → `performance_analyze_insight`) into a trace → analyze → change → re-trace → compare loop against a production-like `next build`, for diagnosing a slow surface or verifying a perf fix. Its automatic twin is the CI Lighthouse budget gate.
- `perf.yml` is that automatic twin: an authed-Today Lighthouse budget gate (`apps/web/lighthouserc.json`) that reuses Bundle B1's hermetic mock-api + fake-JWT harness (LHCI's `puppeteerScript` injects the fake-JWT cookie via `browser.setCookie()`) to assert LCP / TBT / script-bundle-size budgets on the signed-in `/` (Today) surface at PR time. Web-only infra (the parity contract's platform-adapter exemption), no prod, no secrets; thresholds seeded from a measured baseline.
- `/rollup` is the on-demand thin cross-repo CI health roll-up: `tools/rollup.sh` reads the latest `main` run of each tracked quality gate across all three repos (UI + api + landing) and prints ONE consolidated GREEN/RED verdict (exit `0`/`1`/`2`). It reads run conclusions only via `gh` (no `claude-code-action`, no tests, no audit), so it is distinct from `/validate` (which *executes* lint/type/test) and `/prod-readiness` (the LLM pre-launch audit). Its automatic twin is `.github/workflows/rollup.yml` (nightly `0 8 * * *` after the other nightlies + `workflow_dispatch`): a red verdict upserts the one `rollup`-labeled tracking issue, green posts only a job-summary line. Hard-verdict set = the push-to-main + scheduled gates (UI `sonarcloud`/`nightly`/`commit-sweep`, api `sonarcloud`/`mutation`/`benchmark`, landing `nightly`); PR gates + `smoke-prod` are advisory; release/reminder/auto-merge/dependency-review/claude-review are excluded.

## Agent tool scoping

How to give a subagent a shell without handing it the keys. Three rules, ordered by how expensive the mistake is.

- **Never write `tools: Bash(gh:*)` in agent frontmatter — it FAILS OPEN.** The `(...)` specifier is silently stripped, the entry resolves to bare `Bash`, and the agent gets a **full unscoped shell** behind frontmatter that reads like a restriction. It does not error, and the "fails to launch if nothing resolves" safety net never fires, because `Bash(gh:*)` *does* resolve — to `Bash`. Agent `tools:` / `disallowedTools:` accept ONLY bare tool names, `mcp__<server>` patterns, and `Agent(<type>)`. (`disallowedTools: Bash(rm:*)` fails the other way: it strips Bash entirely even when `tools:` grants it, so it is useless as a scalpel.) The `test-hooks` suite fails on any parenthesized specifier in an agent's frontmatter — that guard is the gate, this bullet is the reason. **Scoped `Bash(...)` patterns DO work one layer up**, in `settings.json` `permissions.*` and the `--allowedTools` / `--disallowedTools` CLI flags (a different parser — that is why `/night-run`'s config is legitimate). The trap is agent frontmatter, and only agent frontmatter.
- **An agent-scoped blocking hook MUST live in that agent's own frontmatter `hooks:` field.** `PreToolUse` input carries no `agent_type`, so a hook wired in `settings.json` cannot tell which agent is calling and would police the whole session; `SubagentStart` knows the agent but cannot block. **Scoping is by placement, not by matcher.** `.claude/agents/primer.md` + `.claude/hooks/primer-shell-allowlist.mjs` is the reference implementation.
- **A shell allowlist has TWO levels; either one alone is not a fence.** **(1) Reject metacharacters before matching** — `&` `|` `;` `$` backtick `>` `<` newline — because a prefix check alone lets `git log && echo pwned > x.ts` through. **(2) Allowlist the ARGUMENTS, not just the command prefix.** Rejecting `>` does *not* make "never writes" structural: a subcommand's own flags write files with no metacharacter at all — `git log --format=format:<text> --output=<path>` creates an arbitrary file with chosen content and is pure `git log`. That exact hole shipped in the first cut of this fence and was caught in review (#546). Forbid trailing tokens entirely on entries that take none. **Do not blocklist `--output`** — a blocklist is the whack-a-mole this whole section exists to avoid; allowlist what each entry may carry. Shared logic: `.claude/hooks/_lib/rules-shell-allowlist.mjs`. Keep each agent's allowlist its own (`primer`'s needs are not `Explore`'s; no god-list), and **prefer deleting `Bash` outright** when Glob/Grep/Read cover the job — structural beats any allowlist.

**Do not oversell the fence.** It stops accidents and casual injection, not a determined adversarial payload: `git -C` into a repo with a hostile `.git/config` (`core.pager`, `alias.*`, `diff.external`) still reaches a shell. And **opencode enforces less** — it has no per-agent hooks at all, and its native `permission.bash` globs match the raw string, so a chained command walks through them. When you document a restriction, state which engine enforces it.

## Docs registry

Grep a doc's `At a glance` header before loading the whole file.

| Doc | Purpose |
|---|---|
| `DESIGN.md` | Authoritative UI spec: de-decorated navy-violet anchor (no glow, no gradient wash), semantic tokens, base-4 spacing, measure/motion/a11y rules, 412px shell, plus the `## Enforcement` gate-vs-reviewer contract. |
| `FEATURES.md` | Code-derived, gating- and platform-aware map of every capability. |
| `WORKFLOW.md` | Path-picking guide (`/execute` / `/drive` / `/night-run` / campaign) + the model & effort routing table. |
| `TESTING.md` | How to write tests here + the catalog of every suite and what each proves. |

When you change a doc, update its `At a glance` header and this registry in the same edit.

**Research reports do not live in this repo.** `research.md` and `.claude/research/*` were deleted on 2026-07-16: dossiers in the repo go stale silently and then get cited as authority long after their prices and versions expire. The durable knowledge behind the harness now lives in the brain vault as ADRs (`brain/2 Areas/20-29 Orbit Engineering/Decisions/`) — guardrails-over-memory-rules, autonomy-within-a-phase, refutation-over-voting, and the OpenCode Go/Zen route. `/deep-research` writes its reports there, never here. The repo holds machines; the vault holds knowledge.

## Path-picking & delegation

`WORKFLOW.md` (repo root) is the path-picking guide (tiny bug / real bug / medium feature / multi-issue) — read it before non-trivial work. Delegate independent/heavy work by default (3 concurrent cap; `Explore` for audits; paired worktrees for multi-issue).
