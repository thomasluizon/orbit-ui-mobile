# Plan: three harness gates (convert kept memories → guardrails)

Convert three operational memories into deterministic gates, following the dual-target pattern
(`_lib/` pure rule → Claude Code hook + `.opencode/plugin/orbit-guardrails.js` + `test-hooks.mjs`).
Delete each source memory in the SAME PR once its gate lands. One PR, branch `chore/harness-gates`.

Reference implementations to copy: `rules-source.mjs` (`checkCsharpTimezone` for a path-scoped
content scan), `rules-git.mjs` (`checkNpmExpoPin` for a command check), `forbid-ts-antipatterns.mjs`
(thin CC PostToolUse adapter), `git-guardrails.mjs` (CC PreToolUse adapter), `orbit-guardrails.js`
(opencode wiring of both `tool.execute.before` and `.after`), `test-hooks.mjs` (add assertions).

## Gate 1 — mobile supabase must stay lazy  (source: project_mobile_supabase_lazy_client.md)

- `_lib/rules-source.mjs` → `export function checkMobileSupabaseLazy(filePath, contents)`.
  - Scope: `norm(filePath)` matches `/apps/mobile/.*supabase\.ts$`.
  - Block when the module scope (not inside a function) has a `throw` OR a bare `createClient(` /
    top-level client init. Detect module-scope by matching lines that start at column 0
    (`/^throw\b/m`, `/^(export\s+)?const\s+\w+\s*=\s*createClient\s*\(/m`). Allow the lazy
    `getSupabaseClient()` accessor form.
  - Message: keep the client lazy behind `getSupabaseClient()`; a module-eval throw/init crashes to a
    grey screen at launch (#172/#174).
- CC adapter: new `.claude/hooks/forbid-mobile-supabase-eager.mjs` (model on `forbid-ts-antipatterns.mjs`).
- Register it in the project settings PostToolUse (Edit|Write|MultiEdit) — same block the other
  `forbid-*`/`csharp-*` PostToolUse hooks use.
- Opencode: call `checkMobileSupabaseLazy` in `orbit-guardrails.js` `tool.execute.after`.
- Tests: blocks a module-scope `throw` in `apps/mobile/lib/supabase.ts`; passes the lazy accessor
  version; no-ops off-path and inside a function body.

## Gate 2 — EF migration raw index needs IF NOT EXISTS  (source: project_orbit_api_deploy_migration_pitfall.md)

- `_lib/rules-source.mjs` → `export function checkEfMigrationRawIndex(filePath, contents)`.
  - Scope: `norm(filePath)` matches `/orbit-api/.*Migrations/.*\.cs$`.
  - Block when a `migrationBuilder.Sql(` argument (raw SQL) contains `CREATE [UNIQUE] INDEX` WITHOUT
    `IF NOT EXISTS`, case-insensitive. (Symmetric: also `DROP INDEX` without `IF EXISTS`.) Only scan
    raw-SQL string literals, not `migrationBuilder.CreateIndex(...)` (that path is idempotent-safe).
  - Message: EF runs migrations at startup on Render; a raw `CREATE INDEX` that already exists throws
    Postgres 42P07 and fails the deploy. Use `CREATE INDEX IF NOT EXISTS` (mirrors the Guard-Migrations CI).
- CC adapter: new `.claude/hooks/forbid-ef-migration-raw-index.mjs`.
- Register in project settings PostToolUse.
- Opencode: call it in `tool.execute.after`.
- Tests: blocks `migrationBuilder.Sql("CREATE UNIQUE INDEX ... ON ...")`; passes the `IF NOT EXISTS`
  form and a `migrationBuilder.CreateIndex(...)` call; no-ops off-path.

## Gate 3 — worktree --force junction guard  (source: feedback_worktree_junction_cleanup_footgun.md)

- `_lib/rules-git.mjs` → `export function checkGitWorktreeRemove(command)`.
  - Block when the command matches `git worktree remove` with `--force` or `-f`.
  - Message: on Windows a junction/reparse-point inside the worktree makes `--force` follow the link
    and delete the TARGET's contents. `rmdir` every junction and verify it's gone FIRST, then remove
    the worktree (see the SAFE cleanup order). Rare command + severe data-loss footgun → hard block is OK.
- Wire into `git-guardrails.mjs` (CC PreToolUse) alongside `checkGitCommand`/`checkNpmExpoPin`, and
  into `orbit-guardrails.js` `tool.execute.before`.
- Tests: blocks `git worktree remove --force .claude/worktrees/x` and the `-f` short form; passes a
  plain `git worktree remove` (no force) and unrelated `git` commands.

## Finish

- Run `node .claude/hooks/test-hooks.mjs` — all assertions (existing + new) green.
- Delete the 3 source memories + their MEMORY.md lines in the same PR:
  `project_mobile_supabase_lazy_client.md`, `project_orbit_api_deploy_migration_pitfall.md`,
  `feedback_worktree_junction_cleanup_footgun.md`.
- Update the `test-hooks` count comment if the CLAUDE.md "Agent tool scoping" section cites it.
