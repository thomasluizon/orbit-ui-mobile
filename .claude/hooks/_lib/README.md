# Orbit hook engine: shared logic core

The surviving session hooks keep their rule logic **once** in this `_lib/`
directory. The `.mjs` files in `.claude/hooks/` are thin adapters: read the stdin
payload, call a `_lib` rule, `exit 2` + stderr on a block. Wired in
`.claude/settings.json` (`PreToolUse` / `PostToolUse`).

Every `PreToolUse` guard is registered on the **PowerShell** tool as well as
`Bash`. A matcher of `"Bash"` alone leaves the other shell unguarded, which is not
hypothetical: it defeated every command guard in both repositories until ORB-163.

Most of the old hook fleet migrated to deterministic gates (D6)
(ESLint `local/*` rules, Roslyn `ORBIT0001..0005`, `tools/check-dashes.mjs`,
`tools/check-copy.mjs`, and the `guards.yml` CI jobs) and was deleted in Phase 3,
along with the opencode dual-target plugin (D22). What stays here is what only a
session hook can do: block a command or an edit BEFORE it happens, for rules
that have no CI equivalent.

| `_lib` module | rules | Claude Code hook |
|---|---|---|
| `rules-git.mjs` | git workflow (protected main, no-verify, worktree junction footgun) | git-guardrails (PreToolUse Bash, PowerShell) |
| `rules-orchestrator.mjs` | model spend routes through the launcher; no agent admin merge | orchestrator-guardrails (PreToolUse Bash, PowerShell) |
| `rules-source.mjs` | idempotent raw index SQL in EF migrations | forbid-ef-migration-raw-index (PostToolUse Edit/Write) |
| `repo-roots.mjs` | which repository owns a path, and the linked worktree that resolves to its main checkout | orchestrator-guardrails, forbid-worker-browser, forbid-invented-identifier |
| `io.mjs` | payload normalizers | both |

`rules-orchestrator.mjs` is **cost-raising defence in depth and never the control**:
it is bypassable through another tool, a shell wrapper, or script-file indirection,
and its own header says so. The control for the admin merge is the prohibition in
the worker contract, `AGENTS.md` and `CLAUDE.md`.

`node .claude/hooks/test-hooks.mjs` proves it: `_lib` unit checks, the real hook
files run against stdin payloads (regression guard), and a guard asserting no
agent's frontmatter contains a parenthesized tool specifier (`tools: Bash(gh:*)`
**fails open**: it resolves to bare `Bash` and hands over a full shell). Run it
locally after touching anything here.
