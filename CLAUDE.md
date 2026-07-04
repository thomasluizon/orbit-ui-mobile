# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web` (Next.js 16) + `apps/mobile` (Expo SDK 56) + `packages/shared`.

Cross-cutting rules only live here. Each workspace has a scoped `CLAUDE.md` Claude auto-loads when touching files in that subtree. Read them before writing code in those areas.

## Quick orientation

- Turborepo. Three workspaces: `apps/web`, `apps/mobile`, `packages/shared`.
- Shared package (`@orbit/shared`) owns all Zod types, utils, i18n locales, theme data, API endpoint constants, TanStack query keys, and validation schemas. Both apps import from it.
- The .NET API is a sibling repo at `C:\Users\thoma\Documents\Programming\Projects\orbit-api`. Claude is always launched from THIS repo and reaches into orbit-api via absolute paths when the work needs backend changes.

## Cross-platform parity (MANDATORY)

Every change MUST land in BOTH `apps/web` AND `apps/mobile`. No exceptions. A task is NOT complete until both platforms are updated.

- Modify a hook in `apps/web/hooks/`? Update the equivalent in `apps/mobile/hooks/`.
- Add a feature to a web page? Add it to the mobile screen too.
- Fix a bug in one platform? Check and fix in the other too.
- Add an i18n key? Add it to both `en.json` AND `pt-BR.json` in the same edit.
- Change validation logic? It lives in `packages/shared/` or is duplicated identically.

Allowed differences: platform adapters only — BFF vs direct API, cookie vs SecureStore, shadcn vs NativeWind, next-intl vs i18next. Logic, features, behavior, data flow, error handling: identical.

Before marking any task done, ask: *"Did I update both apps/web and apps/mobile?"*

## Code Standards

**Overriding principle — best implementation, always.** Ship the most correct, most complete, most robust solution. NEVER scope down — cutting a required step, a real fix, or the proper workflow — to save effort, setup, or time. When a genuine tradeoff exists (effort/time/cost), surface it and let the user decide; never pick the cheaper or faster path silently. "Best" means correct and complete, **not** more code — the simplicity and no-premature-abstraction rules below still hold.

These ten rules apply everywhere — `apps/web`, `apps/mobile`, `packages/shared`, and any contributions to `orbit-api`. The PR review bot enforces them.

1. **Root cause over workarounds.** If something is broken upstream, fix it upstream. Don't add fallbacks, defensive branches, or local patches for problems that belong to a config, a type, or a shared util. If a workaround is genuinely unavoidable, write a one-line WHY comment.
2. **Delete unused code immediately.** No "just in case" exports, dead branches, commented-out blocks, stub functions, or speculative parameters. If the linter can't see it's used, delete it.
3. **No `any`.** Use `unknown` with narrowing. No `as any`, no `as unknown as X` escape hatches.
4. **No `console.log` in production code.** Use the project logger if one exists, or don't log.
5. **Comments — strict policy (lint-enforced via `local/no-comments`; autofix strips violations).**
   - Allowed: `/** */` JSDoc on **exported** functions, hooks, and types — one short paragraph on intent and contract.
   - Allowed: a WHY comment ONLY when it links an upstream issue/PR/doc URL (an external constraint you cannot fix here). No link → no comment.
   - Allowed: tooling directives (`eslint-disable`, `@ts-expect-error`, `/// <reference>`).
   - Banned: everything else. No `//` narration, no restating code, no task/PR/fix references, no TODOs. To explain code, rename it or extract a well-named function instead.
6. **No premature abstraction.** Extract on the third real use, not the second. Three similar lines beats a premature helper.
7. **Function size & nesting.** Soft cap: ~50 lines per function, ~3 levels of nesting. Hard cap: ~100 lines. Going beyond means the function is doing too much — split it.
8. **Error handling at boundaries only.** Validate at trust boundaries (user input, external APIs). Inside the codebase, trust your types. Never swallow errors silently — surface them, or don't catch them.
9. **Naming.** Descriptive, no abbreviations, no `data` / `info` / `stuff` / `temp` / `obj` / `helper` / `util` as final names. A name is good if a stranger can guess its purpose from the call site alone.
10. **DRY at the right level.** Cross-app duplication belongs in `packages/shared`. Cross-function-in-file duplication belongs in a local helper. Cross-component duplication belongs in `apps/<platform>/components/`. Don't lift to `shared` for one caller.

## Subagent delegation — default to delegating

When work is independent and can run in parallel, OR when it would consume context the main session shouldn't carry, delegate to subagents by default. Don't ask permission.

**Delegate by default:**
- **Research / exploration / audits** — use an `Explore` subagent instead of running multiple Grep/Read in the main session.
- **Multi-issue work** — when the user references 2+ issues, spawn one subagent per issue (paired with a worktree if implementation is involved).
- **Independent file edits** — multiple unrelated edits run in parallel subagents, not sequentially in the main session.
- **Long-running tasks** (builds, tests, deploys) — spawn as background agents so the main session stays interactive.

**Don't delegate:**
- Single-file edits where the main session already has the context loaded.
- Conversational responses (questions, explanations, design discussions, planning chats).
- Tightly-coupled work where the subagent's context isolation would force re-reading the same files.

**Parallelism cap:** 3 concurrent subagents by default. Raise per-task only if explicitly told ("run all of them at once", "no cap").

See `WORKFLOW.md` for the multi-issue paired-worktree path.

## Security boundaries

- **Auth cookie** (web): httpOnly, sameSite strict, secure always.
- **Mobile auth:** SecureStore. Never persist tokens to AsyncStorage.
- **API contract:** types live in `packages/shared/src/types/*.ts` (Zod schemas). Never invent fields the API doesn't return.
- **Cross-repo contract:** changing an endpoint here needs the matching change in `orbit-api`. The `contract-aligner` subagent flags drift.
- **Backward compatibility (append-only + deploy-order):** shared/DTO contract changes are additive by default — add new optional fields, never rename/remove/retype a field old mobile clients still read (mobile updates ship through the Play store and lag). Breaking changes use expand-contract, not `/v1`,`/v2` versioning. Deploy the API **before** any client depends on the new contract. When a break is unavoidable (or a client fix old versions MUST take), the min-supported-version gate is the lever: raise `AppConfig.MinSupportedVersion` (a DB row, default `0.0.0`=open) to the version carrying the fix — but only **after** that build is live in the Play fleet, never mid-rollout (raising it early strands users who can't upgrade yet). Below the floor → 426 → mobile hard-blocks, web shows a refresh banner; clients not sending `X-App-Version` are always allowed (fail-safe). See #210. `/pr-review` flags breaking `packages/shared`/DTO changes that would break old mobile clients (#206).

## Frontend design

Read `DESIGN.md` at the repo root before any frontend work. It's the source of truth for tokens, primitives, motion, and bans. The full design canon (artboards, kit, token CSS) is vendored at `design/handoff/`.

- Anchor is **navy-violet orbital**, locked: slate-950 canvas, violet accent, gradient headers, translucent cards on dark / white cards on light, pill CTAs with glow, Rubik/Inter/Roboto. Do not re-pick per session, do not hybridise. DESIGN.md is authoritative over user-global design defaults (documented deviation: Inter display + violet accent are deliberate).
- The `impeccable` skill is the running design-review philosophy (anchor / differentiator / AI-slop test / scene-sentence test). Apply it when reviewing or shaping new surfaces.
- Semantic tokens (`--bg`, `--bg-elev`, `--fg-1..4`, `--primary`, `--primary-rgb`, `--hairline`, `--status-*`, `--gradient-header`) are canonical. Never reference raw slate values or hardcode violet rgba in app code — see the derivation + mapping rules in `DESIGN.md`.
- Mobile-first. Canvas is a 412px phone shell on both platforms; web caps at `--app-max-w: 640px`.

## API repository access

- Treat `C:\Users\thoma\Documents\Programming\Projects\orbit-api` as part of the working context when a feature needs backend support.
- Update the API repo in the SAME task — don't stop at frontend-only changes.
- Keep frontend and API contracts aligned: shared endpoints, Zod types, request/response handling, and API implementation move together.
- Don't invent API fields or behavior. Inspect and modify the API repository directly.
- Preserve separate git histories: edits in `orbit-ui-mobile` and `orbit-api` belong to different repositories, different branches, different PRs.

## LSP

C# LSP (OmniSharp/Roslyn) is wired into this repo's `.mcp.json` so this session can read symbols from `orbit-api` even though it's launched from here. If `.mcp.json` is missing on your machine (it's gitignored — local-only), copy from `.claude/mcp.json.example` and set env vars. Fallback wrapper: `.claude/scripts/csharp-lsp.mjs` if the registered MCP package fails to install.

TypeScript LSP is built into Claude Code — works without setup for `apps/web`, `apps/mobile`, `packages/shared`.

## Git workflow

- Branch naming: `feature/xxx`, `fix/xxx`, `chore/xxx`.
- Branch protection on `main`. No direct pushes. Squash-merge only. Head branches auto-delete after merge.
- Never reuse a branch after its PR is squash-merged.
- Never `--no-verify`, `--no-gpg-sign`, or force-push to `main`.
- One feature or fix per PR. Cross-repo work opens paired PRs (one per repo) cross-linked in descriptions.

## Testing

- **Web unit:** Vitest + React Testing Library. Config: `apps/web/vitest.config.ts`.
- **Mobile unit:** Vitest. Config: `apps/mobile/vitest.config.ts`.
- **Shared:** Vitest. Config: `packages/shared/vitest.config.ts`.
- **Factories:** `packages/shared/src/__tests__/factories.ts`.
- **Run:** `npm test` per workspace.
- Unit tests only by default — the old broad Playwright E2E suite was removed as outdated; don't add per-PR E2E, integration suites, or a real-DB harness.
- Exception: a scoped ~5-test web Playwright **smoke suite** (signup, create+log habit, Astra-creates-habit, paywall) runs post-deploy against prod (SMOKE_BASE_URL, the live web origin) and blocks prod promotion (see #227). This is the only sanctioned E2E. A flaky smoke test is fix-or-delete same day — never retry-to-green; keep it ≤~5 tests. No per-PR E2E and no mobile E2E (Detox/Maestro).
- Review tooling: `/pr-review` is the canonical local diff-review skill — it replaces and absorbs the old `/review` + `/security-review` (it orchestrates security-reviewer / contract-aligner / parity-checker / i18n-syncer and runs the backward-compat guard above) (#206). Don't invoke `/review` or `/security-review` separately.
- Every new feature needs tests. Tests asserting behavior, not implementation details.

## Path-picking

`WORKFLOW.md` at the repo root is the path-picking guide — tiny bug, real bug, medium feature, multi-issue. Read it before starting non-trivial work.
