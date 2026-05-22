# Orbit

Personal habit tracker. Turborepo monorepo: `apps/web` (Next.js 15) + `apps/mobile` (Expo SDK 53) + `packages/shared`.

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

These ten rules apply everywhere — `apps/web`, `apps/mobile`, `packages/shared`, and any contributions to `orbit-api`. The PR review bot enforces them.

1. **Root cause over workarounds.** If something is broken upstream, fix it upstream. Don't add fallbacks, defensive branches, or local patches for problems that belong to a config, a type, or a shared util. If a workaround is genuinely unavoidable, write a one-line WHY comment.
2. **Delete unused code immediately.** No "just in case" exports, dead branches, commented-out blocks, stub functions, or speculative parameters. If the linter can't see it's used, delete it.
3. **No `any`.** Use `unknown` with narrowing. No `as any`, no `as unknown as X` escape hatches.
4. **No `console.log` in production code.** Use the project logger if one exists, or don't log.
5. **Comments — strict policy.**
   - Allowed: short doc comments on **public / exported** functions, hooks, and types — one short paragraph on intent and contract.
   - Allowed: WHY comments for non-obvious decisions (workaround for upstream bug, hidden invariant, subtle constraint).
   - Banned: comments that restate the code (`// loop through items`).
   - Banned: comments that reference the current task / PR / fix / ticket.
   - Banned: TODOs without a tracked issue.
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

## Frontend design

Read `DESIGN.md` at the repo root before any frontend work. It's the source of truth for tokens, primitives, motion, and bans.

- Anchor is **Linear-tactical**, locked. Do not re-pick per session, do not hybridise.
- The `impeccable` skill is the running design-review philosophy (anchor / differentiator / AI-slop test / scene-sentence test). Apply it when reviewing or shaping new surfaces.
- v8 OKLCH tokens (`--bg`, `--fg-1`, `--primary`, `--hairline`, etc.) are canonical. Do NOT introduce `--color-background`, `bg-surface-*`, or `text-text-*` in new code — they're aliased for legacy compat only.
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
- **Web E2E:** Playwright. Config: `apps/web/playwright.config.ts`.
- **Mobile unit:** Vitest. Config: `apps/mobile/vitest.config.ts`.
- **Shared:** Vitest. Config: `packages/shared/vitest.config.ts`.
- **Factories:** `packages/shared/src/__tests__/factories.ts`.
- **Run:** `npm test` per workspace, `npm run test:e2e` for Playwright.
- Every new feature needs tests. Tests asserting behavior, not implementation details.

## Path-picking

`WORKFLOW.md` at the repo root is the path-picking guide — tiny bug, real bug, medium feature, multi-issue. Read it before starting non-trivial work.
