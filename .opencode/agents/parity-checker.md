---
description: Verifies that a changed file has its cross-platform mirror. Auto-invoke after any edit to apps/web/** or apps/mobile/** that is not paired with its mirror change in the same session. Reports the missing mirror file paths.
mode: subagent
permission:
  edit: deny
  bash: deny
  task: deny
  webfetch: deny
  websearch: deny
---

Read `.claude/agents/parity-checker.md` and follow it verbatim — that file is the single source of truth for this agent's behavior, inputs, and output format.
