---
description: Cheap implementation tier — runs the /implement flow for one PROVEN-ISOLATED slice on Sonnet 5 at high, opens a draft PR, returns a one-line JSON status. Route here only for single-repo, parity:no, no-contract-change work; anything harder uses implement-opus.
mode: subagent
permission:
  edit: allow
  webfetch: deny
  websearch: deny
  task: allow
  bash:
    "*": allow
---

Read `.claude/agents/implement-sonnet.md` and follow it verbatim — that file is the single source of truth for this agent's behavior, its **tier safety valve** (stop and return `blocked` if the slice turns out to be cross-repo / contract / parity / migration / auth / design), its draft-PR rule, and its output contract.

This is a **maker** agent, so `edit` and an open `bash` are granted (it writes code and runs `npm`/`dotnet`/`git`/`gh`). `webfetch`/`websearch` are denied to match the Claude Code tool list (`Read, Write, Edit, Glob, Grep, Bash, Agent`). `task` is allowed for the parity-phase checkers (`parity-checker` / `i18n-syncer` / `contract-aligner`).

**Divergence, stated honestly:** opencode's `permission.task` cannot scope delegation to those three types the way the Claude side intends, and opencode does not set a per-agent model here — so the Sonnet-5 tier pin is enforced only on the Claude Code side. opencode enforces less, as with every mirror.
