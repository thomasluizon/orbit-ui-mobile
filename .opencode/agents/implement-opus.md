---
description: Hard-path implementation tier — runs the /implement flow for one planned bundle/plan on Opus at xhigh, opens a draft PR, returns a one-line JSON status. Spawned by /drive and /implement (multi-issue). The default tier; cheap sibling is implement-sonnet.
mode: subagent
permission:
  edit: allow
  webfetch: deny
  websearch: deny
  task: allow
  bash:
    "*": allow
---

Read `.claude/agents/implement-opus.md` and follow it verbatim — that file is the single source of truth for this agent's behavior, its phase contract, its draft-PR rule, and its output contract.

This is a **maker** agent, not a read-only one, so unlike the review/search mirrors it grants `edit` and an open `bash` (it writes code, runs `npm`/`dotnet`/`git`/`gh`). `webfetch`/`websearch` are denied to match the Claude Code side's tool list (`Read, Write, Edit, Glob, Grep, Bash, Agent`), which has no network tool. `task` is allowed so it can invoke `parity-checker` / `i18n-syncer` / `contract-aligner` for the parity phase.

**Divergence, stated honestly:** opencode's `permission.task` cannot scope delegation to those three agent types the way the Claude Code side's `Agent` grant is intended to be used — opencode enforces less here, as with every mirror. The tier pin (Opus @ xhigh) lives on the Claude Code side; opencode does not set a per-agent model in these mirrors.
