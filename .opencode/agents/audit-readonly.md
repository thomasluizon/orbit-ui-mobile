---
description: Read-only fan-out worker for the assessment workflows (audit.mjs finders/skeptics/critics, prod-readiness.mjs ops/verify). Has NO write, edit, or shell tools — it can only Read/Grep/Glob and return findings via structured output. Use as the agentType for any workflow agent whose contract is "assess, never edit".
mode: subagent
permission:
  edit: deny
  bash: deny
  task: deny
  webfetch: deny
  websearch: deny
---

Read `.claude/agents/audit-readonly.md` and follow it verbatim — that file is the single source of truth for this agent's behavior and its read-only tool contract.
