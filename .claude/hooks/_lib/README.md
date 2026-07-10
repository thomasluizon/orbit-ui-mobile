# Orbit hook engine — shared logic core

Orbit's enforcement rules live **once** in this `_lib/` directory and are enforced
in **both** tools off that one core, so a fix lands in both at once (no twin drift):

- **Claude Code** — the `.mjs` files in `.claude/hooks/` are thin adapters: read
  the stdin payload, call a `_lib` rule, `exit 2` + stderr on a block. Wired in
  `.claude/settings.json` (`PreToolUse` / `PostToolUse`).
- **opencode** — `.opencode/plugin/orbit-guardrails.js` is one plugin that calls
  the same `_lib` rules from `tool.execute.before` (git + Expo-pin + added-text
  content, which block by `throw`) and `tool.execute.after` (whole-file rules +
  parity nudge, which surface to the model). opencode auto-loads it.

| `_lib` module | rules | Claude Code hook(s) | opencode hook |
|---|---|---|---|
| `rules-git.mjs` | git workflow, Expo-SDK pin | git-guardrails, forbid-expo-pin-bump | tool.execute.before(bash) |
| `rules-content.mjs` | em dashes, brand colors | forbid-em-dashes, forbid-hardcoded-brand-color | tool.execute.before(edit/write) |
| `rules-source.mjs` | TS anti-patterns, workaround markers, csharp authz/tz/fluentconfig | forbid-ts-antipatterns, flag-new-todos, csharp-authz, csharp-tz, csharp-fluentconfig | tool.execute.after(edit/write) |
| `rules-parity.mjs` | cross-platform parity nudge | parity-nudge | tool.execute.after(edit/write) |
| `io.mjs` | payload normalizers (both tools) | all | all |

**Mapping note.** opencode has no PostToolUse: `tool.execute.before` sees the
pending edit (so added-text rules block before the write), and `tool.execute.after`
sees the written file (so whole-file rules match, and a throw surfaces the violation
the way the Claude Code exit-2 does). The proactivity guard is a re-injection +
Stop-hook pair globally on Claude Code; opencode gets a best-effort `session.idle`
nudge since it cannot rewind a finished turn.

`node .claude/hooks/test-hooks.mjs` proves the whole thing: `_lib` unit checks, the
real Claude Code hooks (regression guard), and the real opencode plugin — same rule,
same verdict, both tools.

This mirrors the generic dual-target engine in the `agentic-dev-workflow` pack
(Stage 7b); Orbit keeps its own project-specific rules rather than consuming the pack.
