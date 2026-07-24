# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web` (Next.js 16), `apps/mobile` (Expo SDK 57, Android-only), `packages/shared`. Sibling repos worked from this session: `orbit-api` (.NET 10 / EF Core / MediatR CQRS) + `orbit-landing-page` (Astro 6 + Tailwind v4).

<!-- Sibling guidance lives in each repo; it loads here because Orbit sessions always launch from orbit-ui-mobile. @-imports load in full every session and survive /compact. -->
@../orbit-api/CLAUDE.md
@../orbit-landing-page/CLAUDE.md

Each workspace has a scoped `CLAUDE.md` that loads when you touch its files; per-stack detail lives there. This root holds only cross-cutting Orbit rules.

## Maximum implementation (overrides global rule 4, "surgical changes")

While building or fixing, see something broken, stale, or wrong? Fix it immediately, in the same PR. Never report it as "out of scope" or "pre-existing." Exception: the review and audit skills (`/pr-review`, `/audit-*`) stay scoped to their own rubric; they report findings, they don't remediate mid-pass. Do everything in your power yourself (MCP servers, CLIs, APIs); only involve me when there is genuinely no way for you to do it.

## The workflow (REBUILD.md, D1-D9)

Linear is the source of truth for product work in this repo and orbit-api; GitHub Issues holds orbit-landing-page, infra chores, and Dependabot (D1). Two verbs:

- **`/feature <idea>`** produces a Linear project: N executable tickets with an explicit `blockedBy` DAG. **`/bug <description>`** produces one ticket, same format. Both write NO code; the `product-manager` and `design-specialist` agents interrogate the idea first. The ticket IS the prompt (D2): a ticket a fresh agent cannot execute is a defective ticket, and `tools/check-ticket.mjs` rejects an incomplete body.
- **`/orchestrate <project or ticket>`** builds the merge-gated wave table (`tools/wave-plan.mjs`) and runs one Orca worktree + worker per ticket. A ticket starts only when every blocker is merged to `main` (D3); one ticket = one repo = one reviewable PR, target under 400 lines (D4); cross-repo work is an api ticket that blocks a ui ticket, so deploy-API-first is a DAG edge. The worker engine is `.claude/orchestrator.json` (`claude` | `codex` | `auto`, D5). A `visible-effect` ticket needs a screenshot + test output attached before In Review (D7, `tools/capture-surfaces.mjs`); review findings are reconciled against the code before becoming work (D8); two failures means the ticket body is wrong, not the agent (D9). A human merge is the only thing that advances a wave.

The session always opens in orbit-ui-mobile (D17); the orchestrator spawns worktrees into whichever repo the ticket targets. `AGENTS.md` (repo root) is Codex's entry doc: the worker contract plus `## Code Review Rules` (D26/D27). It DEFERS to this CLAUDE.md for conventions; change behaviour here, never there.

## Cross-platform parity (MANDATORY)

Every change lands in BOTH `apps/web` AND `apps/mobile` in the same task: logic, features, behavior, and error handling identical; reverts included. Allowed differences: platform adapters only (BFF vs direct API, cookie vs SecureStore, shadcn vs NativeWind, next-intl vs i18next). i18n keys land in `en.json` AND `pt-BR.json` in the same edit. The Cross-Platform Parity CI job (`guards.yml`) fails a one-sided UI change (escape hatch: the `parity:exempt` label); the `parity-checker` subagent flags drift in-session.

## Code standards

Ten rules, applied everywhere. The checkable ones (3, 4, 5, plus the dash and copy bans) are enforced by gates: ESLint `local/*`, the `guards.yml` CI jobs (Dash Ban via `tools/check-dashes.mjs`, Copy Register via `tools/check-copy.mjs`, Suppressions Ratchet, Expo SDK Pin, Cross-Platform Parity), and Roslyn `ORBIT0001..0005` in orbit-api. Trust them rather than re-checking by eye; the rest need judgment.

1. **Root cause over workarounds.** No fallbacks or defensive branches for a problem that belongs to an upstream config, type, or util. A genuinely unavoidable workaround gets a one-line WHY comment linking the issue.
2. **Delete unused code immediately.** No "just in case" exports, dead branches, or stub functions.
3. **No `any`.** Use `unknown` with narrowing; no `as any` / `as unknown as X`. (lint-enforced)
4. **No `console.log` in production code.** Use the logger or don't log. (lint-enforced)
5. **Comments, strict policy** (lint-enforced via `local/no-comments`): only JSDoc on exports, a WHY comment linking an issue/PR/doc URL, or tooling directives. Everything else is stripped; rename or extract instead.
6. **No premature abstraction.** Extract on the third real use, not the second.
7. **Function size & nesting.** Soft cap ~50 lines / ~3 nesting levels; hard cap ~100. Beyond means split.
8. **Error handling at boundaries only.** Validate at trust boundaries (user input, external APIs); inside, trust your types. Never swallow errors silently.
9. **Naming.** Descriptive, no abbreviations, never `data`/`info`/`stuff`/`temp`/`obj`/`helper`/`util` as a final name.
10. **DRY at the right level.** Cross-app duplication goes to `packages/shared`; cross-component to `apps/<platform>/components/`; don't lift to shared for one caller.

## Security & contracts

Auth: web cookie is httpOnly + sameSite strict + secure; mobile tokens live in SecureStore, never AsyncStorage. API contract types live in `packages/shared/src/types/*` (Zod); never invent a field the API doesn't return. Shared/DTO changes are **append-only and deploy-API-first**: add optional fields; never rename/remove/retype a field old mobile clients still read (mobile lags via the Play store). Breaking changes use expand-contract plus the `AppConfig.MinSupportedVersion` gate; raise it only after the carrying build is live in the Play fleet (#210). `/pr-review` runs the backward-compat guard (#206); the `contract-aligner` subagent flags endpoint drift.

## Brand & design

"Orbit" and "Astra" are never translated. `DESIGN.md` (repo root) is authoritative for all UI: the **de-decorated** navy-violet orbital anchor (#539 freeze, 2026-07-17), semantic tokens only (`--bg`, `--bg-elev`, `--fg-1..4`, `--primary`, `--primary-soft`, `--primary-rgb`, `--hairline`, ...), an **enumerated** spacing scale (`0 4 8 12 16 20 24 28 32 40 48 56 64` and nothing else, plus three named exemptions), mobile-first 412px shell. **No decorative glow and no gradient wash anywhere**: the `--gradient-header` and primary-glow tokens are deleted; identity is carried by the orbital logo, the Astra glyph, and ring indicators. `--primary` is fill/graphic only, `--primary-soft` is accent text (see the accent-split section). Read it before any frontend work; apply the `impeccable` skill when shaping or reviewing a surface. Expanding the design system (a new token, colour, gradient, radius, shadow, font, or effect) is a request to me, never a judgement call.

## Conventions & tooling

- `orbit-api` is a sibling at `C:\Users\thoma\Documents\Programming\Projects\orbit-api`; update it in the same task when a feature needs backend support. Separate git histories, branches, and PRs.
- C# LSP for orbit-api is wired via `.mcp.json`: the Roslyn-backed CWM.RoslynNavigator MCP server (install once: `dotnet tool install -g CWM.RoslynNavigator`) pointed at orbit-api's `Orbit.slnx`; copy from `.claude/mcp.json.example`.
- Reusable agent scripts live in `tools/` under the `tools/CONVENTIONS.md` contract (catalog: `tools/README.md`); build a new one with `/make-tool` once you have run the same incantation twice; a one-off stays in the scratchpad.
- Git: one feature/fix per PR (cross-repo work opens paired PRs, cross-linked); branches `feature/`|`fix/`|`chore/`; `main` is protected (no direct or force push, enforced by the `git-guardrails` hook); squash-merge only; never `--no-verify`/`--no-gpg-sign`; never reuse a squash-merged branch.
- Session hooks (`.claude/settings.json`) are down to the two rules no CI gate can enforce at act time: `git-guardrails` (protected main, no-verify, the worktree junction footgun) and `forbid-ef-migration-raw-index` (idempotent raw index SQL in EF migrations). Everything else the old hook fleet enforced migrated to the deterministic gates named under Code standards (REBUILD.md 6.1), and the opencode dual-target engine is gone (D22). `node .claude/hooks/test-hooks.mjs` is the local proof; run it after touching `.claude/hooks/` or an agent's frontmatter.
- A real git-level `pre-commit` hook (lefthook, root `lefthook.yml`) lints staged files and re-stages autofixes; it self-installs via the root `prepare` script on `npm install`/`npm ci` (resilient `lefthook install || true`, a no-op in CI/Vercel), so a fresh clone needs no extra step.
- Testing: Vitest unit tests only; every feature needs behavior tests. The only sanctioned E2E against prod is the post-deploy web smoke suite; a separate hermetic web visual-regression gate (`.github/workflows/visual.yml`, web-only by locked decision) screenshots four surfaces against a local mock orbit-api at PR time. Configs live in each workspace. `TESTING.md` (repo root) is the suite catalog + how to write a test here.
- `/pr-review` is the canonical local diff review (orchestrates security-reviewer / contract-aligner / parity-checker / i18n-syncer + the backward-compat guard). In CI, `claude-review.yml` is the sole verdict-carrying reviewer (D25); the Codex cloud integration is the second reviewer, steered by `AGENTS.md` (D26).
- `/commit-sweep` is the report-only cross-commit, cross-repo regression sweep over a window of recent `main` commits in BOTH repos (default last 10, or `--since <when>`): the backstop for gotchas a per-diff `/pr-review` or a whole-repo `/audit-*` structurally miss because PRs merge in isolation. Nightly via `.github/workflows/commit-sweep.yml`, on demand as `/commit-sweep`.
- `/profile` is the on-demand, interactive web performance profiler (the chrome-devtools MCP trace, analyze, change, re-trace loop against a production-like `next build`). Its automatic twin is `perf.yml`: the authed-Today Lighthouse budget gate (`apps/web/lighthouserc.json`) on the hermetic mock-api + fake-JWT harness, asserting LCP / TBT / script-bundle-size budgets on the signed-in `/` (Today) surface at PR time. Web-only infra (the parity contract's platform-adapter exemption); thresholds seeded from a measured baseline.
- `/rollup` is the on-demand thin cross-repo CI health roll-up: `tools/rollup.sh` reads the latest `main` run of each tracked quality gate across all three repos (UI + api + landing) and prints ONE consolidated GREEN/RED verdict (exit `0`/`1`/`2`). It reads run conclusions only via `gh`, so it is distinct from `/validate` (which EXECUTES lint/type/test) and `/prod-readiness` (the LLM pre-launch audit). Its automatic twin is `.github/workflows/rollup.yml` (nightly): a red verdict upserts the one `rollup`-labeled tracking issue, green posts only a job-summary line.

## Agent tool scoping

- **Never write `tools: Bash(gh:*)` in agent frontmatter; it FAILS OPEN.** The `(...)` specifier is silently stripped, the entry resolves to bare `Bash`, and the agent gets a **full unscoped shell** behind frontmatter that reads like a restriction. It does not error, and the "fails to launch if nothing resolves" safety net never fires, because `Bash(gh:*)` DOES resolve, to `Bash`. Agent `tools:` / `disallowedTools:` accept ONLY bare tool names, `mcp__<server>` patterns, and `Agent(<type>)`. (`disallowedTools: Bash(rm:*)` fails the other way: it strips Bash entirely even when `tools:` grants it, so it is useless as a scalpel.) The `test-hooks` suite fails on any parenthesized specifier in an agent's frontmatter; that guard is the gate, this bullet is the reason. Scoped `Bash(...)` patterns DO work one layer up, in `settings.json` `permissions.*` and the `--allowedTools` / `--disallowedTools` CLI flags (a different parser). The trap is agent frontmatter, and only agent frontmatter.
- **An agent-scoped blocking hook MUST live in that agent's own frontmatter `hooks:` field.** `PreToolUse` input carries no `agent_type`, so a hook wired in `settings.json` cannot tell which agent is calling and would police the whole session; `SubagentStart` knows the agent but cannot block. **Scoping is by placement, not by matcher.**
- **Prefer deleting `Bash` outright** when Glob/Grep/Read cover the job; structural beats any allowlist. If an agent genuinely needs a scoped shell, an allowlist has TWO levels and either one alone is not a fence: (1) reject metacharacters (`&` `|` `;` `$` backtick `>` `<` newline) before matching, because a prefix check alone lets `git log && echo pwned > x.ts` through; (2) allowlist the ARGUMENTS, not just the command prefix, because a subcommand's own flags write files with no metacharacter at all (`git log --format=format:<text> --output=<path>` creates an arbitrary file and is pure `git log`; that exact hole shipped once and was caught in review, #546). Never blocklist single flags; that is the whack-a-mole the allowlist exists to avoid. And do not oversell the fence: it stops accidents and casual injection, not a determined adversarial payload (`git -C` into a repo with a hostile `.git/config` still reaches a shell).

## Docs registry

Grep a doc's `At a glance` header before loading the whole file.

| Doc | Purpose |
|---|---|
| `DESIGN.md` | Authoritative UI spec: de-decorated navy-violet anchor (no glow, no gradient wash), semantic tokens, the enumerated spacing scale (`0 4 8 12 16 20 24 28 32 40 48 56 64` + three named exemptions, gated by `local/spacing-scale`), measure/motion/a11y rules, 412px shell, plus the `## Enforcement` gate-vs-reviewer contract. |
| `REBUILD.md` | The workflow teardown/rebuild plan and its locked decision register (D1..D42, the phase ledger). **Temporary by design**: it dies when Phase 7 completes; its durable parts graduate to CLAUDE.md, AGENTS.md, DESIGN.md, and brain ADRs. |
| `AGENTS.md` | Codex's entry doc: the worker contract + `## Code Review Rules`. Defers to this CLAUDE.md for conventions. |
| `FEATURES.md` | Hand-maintained, gating- and platform-aware capability catalogue (the source the Play listing, landing, and QA copy derive from). Kept honest by the `/pr-review` feature-inventory parity gate (rubric #14), not by generation; it holds the Free/Trial/Pro/Yearly gating the generated arch map does not. |
| `TESTING.md` | How to write tests here + the catalog of every suite and what each proves. |
| `architecture.json` / `architecture.html` | The generated architecture map (routes and screens with parity pairs, endpoints, i18n key ownership), kept fresh by the `arch-map.yml` drift gate. What an agent reads INSTEAD of exploring the codebase. |
| `.claude/rules/core.md` | The ~50 lines of judgement that auto-load on EVERY turn. A rule earns a place only if it applies in any turn AND no skill invocation reliably precedes it. Everything in `.claude/rules/` is paid for on every turn of every session, so treat additions here as expensive. |
| `.claude/playbooks/` | The on-demand judgement tier: standing rules no gate can check, themed by activity (debugging, review-and-audit, planning-and-artifacts, context-engineering). Nothing here auto-loads; the skill or agent that needs one cites it by path. `context-engineering.md` is the one to read before authoring anything the agent itself reads (a `CLAUDE.md`, a rule, a skill, an agent, a tool interface, a ticket body). |
| `.claude/manifests/surfaces.json` | The DERIVED visual-surface inventory (routes + the multi-view Today root + overlays, x theme x locale). Generated by `tools/surface-manifest.mjs`; carries no status field by design. With `tools/redesign-coverage.mjs` (every surface claimed by exactly one #539 ticket per D35, plus every `.tsx` under `apps/*/app` + `apps/*/components` mapped to exactly one ticket by directory rule per D38; exit 1 on any unclaimed surface or orphaned file) it is the redesign's denominator; both survive until the #539 Linear project completes, then fold into the arch map (D39). |

When you change a doc, update its `At a glance` header and this registry in the same edit.

**Research reports do not live in this repo.** Dossiers in the repo go stale silently and then get cited as authority long after their prices and versions expire. Durable knowledge lives in the brain vault as ADRs (`brain/2 Areas/20-29 Orbit Engineering/Decisions/`); `/deep-research` writes its reports there, never here. The repo holds machines; the vault holds knowledge.
