# Orbit hook engine: shared logic core

The two surviving session hooks keep their rule logic **once** in this `_lib/`
directory. The `.mjs` files in `.claude/hooks/` are thin adapters: read the stdin
payload, call a `_lib` rule, `exit 2` + stderr on a block. Wired in
`.claude/settings.json` (`PreToolUse` / `PostToolUse`).

Most of the old hook fleet migrated to deterministic gates in REBUILD.md Phase 1
(ESLint `local/*` rules, Roslyn `ORBIT0001..0005`, `tools/check-dashes.mjs`,
`tools/check-copy.mjs`, and the `guards.yml` CI jobs) and was deleted in Phase 3,
along with the opencode dual-target plugin (D22). What stays here is what only a
session hook can do: block a command or an edit BEFORE it happens, for rules
that have no CI equivalent.

| `_lib` module | rules | Claude Code hook |
|---|---|---|
| `rules-git.mjs` | git workflow (protected main, no-verify, worktree junction footgun) | git-guardrails (PreToolUse Bash) |
| `rules-source.mjs` | idempotent raw index SQL in EF migrations | forbid-ef-migration-raw-index (PostToolUse Edit/Write) |
| `io.mjs` | payload normalizers | both |

`node .claude/hooks/test-hooks.mjs` proves it: `_lib` unit checks, the real hook
files run against stdin payloads (regression guard), and a guard asserting no
agent's frontmatter contains a parenthesized tool specifier (`tools: Bash(gh:*)`
**fails open**: it resolves to bare `Bash` and hands over a full shell). Run it
locally after touching anything here.
