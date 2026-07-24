---
name: feature
description: Idea in, Linear project out. Interrogates the idea with the product-manager (and design-specialist for UI) agents, decomposes it into executable tickets per the 6.2 template, validates every body with tools/check-ticket.mjs, then creates the Linear project + issues + explicit blockedBy DAG via the orca CLI. Writes NO code. Use for any feature request; /bug is its one-ticket sibling; /orchestrate builds what this creates.
argument-hint: <the idea, one sentence is enough>
effort: high
---

# /feature: idea -> Linear project

The ticket is the prompt (D2): a ticket that a fresh agent with no session history
cannot execute is a defective ticket. This skill exists to make defective tickets
impossible to create.

Constants: orca binary `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`,
team `ORB`. Config: `.claude/orchestrator.json`.

## Phase A: interrogate

1. Spawn the `product-manager` agent with the idea + `architecture.json` (the map of
   routes, endpoints, parity pairs). It returns: the sharpened problem statement, the
   affected surfaces/endpoints, open questions, and a first-cut ticket split.
2. If any surface is user-visible, spawn `design-specialist` in parallel: it returns the
   DESIGN.md constraints that bind each ticket and whether the ask needs a token or
   pattern DESIGN.md lacks (which is a question for Thomas, never a judgement call).
3. Batch every genuine fork into ONE AskUserQuestion call. Do not ask what the codebase,
   `architecture.json`, or DESIGN.md already answers.

## Phase B: decompose and validate

Standing rules (violating any one is a defect):
- One ticket = one repo = one reviewable PR, target under 400 lines (D4). Label exactly
  one of `repo:ui` / `repo:api` / `repo:landing`. `repo:both` does not exist: cross-repo
  work is an api ticket that BLOCKS a ui ticket, which encodes deploy-API-first as a DAG
  edge.
- ui tickets declare `parity:yes` (web + mobile in the same PR) or `parity:no` with the
  platform-adapter justification in the body.
- Never a separate ticket for tests. Migration + schema live in the feature's ticket.
  No "foundation" ticket full of unused functions. Tickets over 5 points get split.
- The dependency graph is explicit relations, never prose ("after X lands" in a body
  without a blockedBy relation fails the checker).
- User-visible tickets carry the `visible-effect` label and state the D7 contract in the
  body: a screenshot attached to the Linear issue is required to reach In Review.
- Shared/DTO changes are append-only and deploy-API-first; say so in the api ticket.

Per ticket: draft the body to the scratchpad using the template sections (Problem/why,
Scope, Out of scope, Expected behaviour, Technical details, Affected modules/files,
Acceptance criteria, Test scenarios, plus Rollout/kill-switch and Events/metrics where
risk or measurement exists), then run
`node tools/check-ticket.mjs --file <draft>` and fix until it exits 0.

## Phase C: create

1. `orca linear create` the project (name = the feature); the project description
   carries the locked decisions from Phase A verbatim; /orchestrate re-reads it every
   wave and honours it.
2. `orca linear create` each issue (title, validated body, labels, state Todo,
   project).
3. `orca linear relation add` every blockedBy edge.
4. Re-validate each created issue: `node tools/check-ticket.mjs --issue ORB-N` (this
   pass also checks labels + relations, which --file cannot).
5. Print the final table: identifier, title, repo, blockedBy, wave (from
   `node tools/wave-plan.mjs --project "<name>"`).

Stop there. No code, no branches, no worktrees (D10: output is tickets, never a report
and never an implementation).
