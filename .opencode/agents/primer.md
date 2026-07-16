---
description: Loads context for ONE issue inside its worktree and reports a structured summary (title, repos label, parity flag, acceptance criteria, open questions/risks). Read-only by contract — it can never edit. Used as the agentType for /prime's multi-issue fan-out, and inherited by /execute and /drive's prime stage.
mode: subagent
permission:
  edit: deny
  task: deny
---

Read `.claude/agents/primer.md` and follow it verbatim — that file is the single source of truth for this agent's behavior, its output contract, and its read-only rule.
