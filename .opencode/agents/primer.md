---
description: Loads context for ONE issue inside its worktree and reports a structured summary (title, repos label, parity flag, acceptance criteria, open questions/risks). Never plans, edits, or implements. Used as the agentType for /prime's multi-issue fan-out, and inherited by /execute and /drive's prime stage.
mode: subagent
permission:
  edit: deny
  task: deny
  webfetch: deny
  websearch: deny
---

Read `.claude/agents/primer.md` and follow it verbatim — that file is the single source of truth for this agent's behavior, its output contract, and its never-edit rule.

This mirror must match the capability surface of the Claude Code side, whose `tools: Glob, Grep, Read, Bash` allowlist structurally excludes WebFetch and WebSearch. Here the schema is a denylist, so anything not denied is granted — hence `webfetch`/`websearch` are denied explicitly, as in every other mirror. `/prime` feeds this agent untrusted GitHub issue bodies, so leaving a network egress open would be an exfiltration channel the Claude Code side cannot have.

`bash` is the one deliberate divergence from the other read-only mirrors: `/prime` needs `gh` and `git`. That is why the never-edit rule is behavioral rather than structural — the body explains the limit.
