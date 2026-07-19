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
| `rules-secrets.mjs` | literal credential in argv | forbid-secret-in-argv (**fails closed**) | tool.execute.before(bash) |
| `rules-content.mjs` | em dashes, brand colors | forbid-em-dashes, forbid-hardcoded-brand-color | tool.execute.before(edit/write) |
| `rules-copy.mjs` | i18n copy register: AI-cliché, placeholder content, typed UPPERCASE | forbid-ai-cliche-copy, forbid-placeholder-content, forbid-typed-uppercase | tool.execute.before(edit/write) |
| `rules-source.mjs` | TS anti-patterns, workaround markers, csharp authz/tz/fluentconfig | forbid-ts-antipatterns, flag-new-todos, csharp-authz, csharp-tz, csharp-fluentconfig | tool.execute.after(edit/write) |
| `rules-parity.mjs` | cross-platform parity nudge | parity-nudge | tool.execute.after(edit/write) |
| `rules-shell-allowlist.mjs` | agent-scoped shell allowlists | primer-shell-allowlist (**agent frontmatter**, not settings.json) | **none** — see "The one rule that is not dual-target" |
| `io.mjs` | payload normalizers (both tools) | all | all |

**The copy rules are values-only, and that is the whole soundness argument.**
`rules-copy.mjs` extracts the i18n JSON **values** an edit introduced and scans
only those — never the keys, never code. A key named `seamless.title` is not copy,
and flagging it would be the false positive that makes a gate worse than no gate.
Where a fragment is structured but no `"key": "value"` pair is extractable, the
rules fail **open**: a missed edit is cheap, a false block is not. `test-hooks.mjs`
carries a **corpus guard** that runs each copy rule over the real `en.json` and
`pt-BR.json` (2466 strings each) and pins the false-positive count at zero — that
guard is what disqualified the proposed straight-punctuation rule (148
counter-examples in shipped copy) before it could land. A copy rule that fights
the product's own strings is wrong about the rule, not about the strings.

**Mapping note.** opencode has no PostToolUse: `tool.execute.before` sees the
pending edit (so added-text rules block before the write), and `tool.execute.after`
sees the written file (so whole-file rules match, and a throw surfaces the violation
the way the Claude Code exit-2 does). The proactivity guard is a re-injection +
Stop-hook pair globally on Claude Code; opencode gets a best-effort `session.idle`
nudge since it cannot rewind a finished turn.

**The one rule that is not dual-target.** `rules-shell-allowlist.mjs` is the
exception to everything above, and the exception is structural, not an oversight.

It is wired in **`.claude/agents/primer.md`'s own frontmatter**, never in
`settings.json`, because `PreToolUse` input carries no `agent_type`: a globally
wired hook cannot tell which agent is calling and would police every Bash call in
the session. `SubagentStart` knows the agent but cannot block. **Scoping is by
placement** — a frontmatter hook runs only while its agent is active.

opencode has **no equivalent**. Its agent schema has no `hooks` field, plugins are
global, and `tool.execute.before` receives only `{ tool, sessionID, callID }` — no
agent identity, and the SDK's `Session` type has no agent field to recover it from.
So this rule cannot be mirrored into `orbit-guardrails.js` the way the others are.
opencode has no per-agent hooks at all, and its native `permission.bash` globs are
**weaker**: the matcher tests the raw command string, so `git log && rm -rf /`
matches a `"git log *"` allow rule and runs. The `.opencode/agents/` mirrors that
used to document this gap were deleted 2026-07-19 rather than maintained on an
inverted allowlist/denylist schema that silently widens as it drifts; the gap is
recorded in `CLAUDE.md` instead. Do not describe the Claude Code fence as a
cross-engine guarantee.

**The allowlist is two levels, and level 2 is the one people forget.** Metacharacters
(`& | ; $ backtick > < newline`) are rejected before any matching, because a prefix
check alone lets `git log && echo pwned > x.ts` through. But that is *not* enough to
enforce "never writes": `git log --format=format:pwned --output=x.ts` writes an
arbitrary file with chosen content, uses no metacharacter at all, and is pure
`git log`. So every token after the matched prefix must also match that entry's
`argument` pattern, and entries like `git branch --show-current` take no arguments
at all. Blocklisting `--output` would just restart the whack-a-mole — allowlist the
arguments instead.

The adapter also **fails closed** (exit 2 on an unreadable payload), unlike every
other adapter here, which exits 0 on error so a broken hook never wedges Bash. This
one is a security fence: an unvalidated command must not run.

`node .claude/hooks/test-hooks.mjs` proves the whole thing: `_lib` unit checks, the
real Claude Code hooks (regression guard), the real opencode plugin — same rule,
same verdict, both tools — and a guard asserting no agent's frontmatter contains a
parenthesized tool specifier (`tools: Bash(gh:*)` **fails open**: it resolves to
bare `Bash` and hands over a full shell). It runs in CI as `test.yml`'s
**Harness Hook Parity** job.

This mirrors the generic dual-target engine in the `agentic-dev-workflow` pack
(Stage 7b); Orbit keeps its own project-specific rules rather than consuming the pack.
