---
name: feature
description: Idea in, executable Linear tickets out. Interrogates the idea with the product-manager (and design-specialist for UI) agents, decomposes it into tickets per the 6.2 template, validates every body with tools/check-ticket.mjs, routes them into an existing project or a new one, then creates the issues + explicit blockedBy DAG via the orca CLI. Writes NO code. Use for a multi-ticket feature request; /ticket is its one-ticket sibling; /orchestrate builds what this creates.
argument-hint: <the idea, one sentence is enough>
effort: high
---

# /feature: idea -> Linear project

The ticket is the prompt (D2): a ticket that a fresh agent with no session history
cannot execute is a defective ticket. This skill exists to make defective tickets
impossible to create.

Constants: orca binary `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`,
team `ORB`.

## Phase A: interrogate

1. Spawn the `product-manager` agent with the idea + `architecture.json` (the map of
   routes, endpoints, parity pairs). It returns: the sharpened problem statement, the
   affected surfaces/endpoints, open questions, and a first-cut ticket split.
2. If any surface is user-visible, spawn `design-specialist` in parallel: it returns the
   DESIGN.md constraints that bind each ticket and whether the ask needs a token or
   pattern DESIGN.md lacks (which is a question for Thomas, never a judgement call).
3. Batch every genuine fork into ONE AskUserQuestion call. Do not ask what the codebase,
   `architecture.json`, or DESIGN.md already answers.

## Phase B: prove scope completeness

Before decomposing tickets or editing any draft, read and execute
`.claude/skills/_shared/scope-completeness.md`. Produce one list for the feature, assign
every required change to exactly one ticket, and copy that ticket's entries into its Scope
and Affected modules / files.

## Phase C: decompose and validate

Standing rules (violating any one is a defect):
- One ticket = one repo = one reviewable PR, target under 400 lines (D4). Label exactly
  one of `repo:ui` / `repo:api` / `repo:landing`. `repo:both` does not exist: cross-repo
  work is an api ticket that BLOCKS a ui ticket, which encodes deploy-API-first as a DAG
  edge.
- Label every ticket with exactly one Linear type: `Feature` for a new user or system
  capability, `Bug` for a defect where current behaviour contradicts intended behaviour,
  or `Improvement` for a chore, enhancement to existing behaviour, refactor, tooling task,
  or docs task. State each chosen type and why in the plan before creation; never infer it
  silently.
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

## Phase D: create

0. **Resolve the project BEFORE the gate, and never by default.** Run
   `orca linear project list` and decide between two outcomes. A new project is not
   the automatic answer; minting one per idea is how the board fills with
   single-ticket projects nobody orchestrates.
   - **Route into an existing project** when the work extends its scope (a redesign
     ticket into `539 Redesign`, an Astra ticket into `562 Astra`, a launch blocker
     into `Launch`). Also route when the feature is small: under 3 tickets, or with
     no internal blockedBy edges, belongs in an existing project, `Backlog` if none
     fits. Its locked decisions then go in the ticket bodies, not a project content
     document, because the existing project's content belongs to its own work.
   - **Create a new project** only when the work is 3+ tickets AND carries either an
     internal DAG or a set of locked decisions every ticket must honour. That
     content document is the thing a project buys; without one, a project is a label
     with extra steps.
1. **HARD GATE, before anything external exists:** show Thomas the full plan in one
   message: the resolved project (named, and whether it is new or existing, with the
   one-line reason), the locked decisions, and the ticket table (title, repo label,
   type label and reason, parity label, blockedBy, wave). Then ask for explicit approval via ONE
   AskUserQuestion call, whose FIRST question is the project decision with the
   alternative as the second option, so routing is a choice he sees rather than one
   this skill made quietly. Nothing is created in Linear until he approves; an edit
   request loops back through Phase C and re-validation, then this gate again.
2. Only when step 0 resolved to a NEW project: create it (name = the feature).
   `orca linear` has no project write of any kind (`project list` is its whole
   project surface), so this and the content write below are the ONLY two Linear
   writes done raw. Read the personal key at `$env:USERPROFILE\.linear-api-key`
   into a variable (never echo it), and POST https://api.linear.app/graphql with
   header `Authorization: <key>` (the raw key) and mutation
   `projectCreate(input: { name: "<name>", teamIds: ["<ORB team id>"],
   description: "<one-line pointer>" }) { project { id } }`. Linear hard-caps
   `description` at 255 chars, so the substance goes in CONTENT, not there.
   Then write the locked decisions from Phase A verbatim into the project content
   (the overview document) with
   `projectUpdate(id: "<id>", input: { content: "<locked decisions>" }) { success }`.
   /orchestrate re-reads the content every wave and honours it.
   Every OTHER Linear write in this skill goes through orca, enforced by the
   `forbid-raw-linear-mutation` hook: a raw `issueCreate` is blocked at act time.
3. `node tools/new-ticket.mjs` each issue (title, validated body, exactly one type label,
   remaining labels, state
   Todo, and `--project` with the project step 0 resolved), which wraps
   `orca linear create` and validates what it created. It REFUSES to create a
   ticket with no project: /orchestrate is project-scoped by default, so a
   project-less ticket is created and then never picked up by anything.
4. `orca linear relation add` every blockedBy edge.
5. Re-validate each created issue: `node tools/check-ticket.mjs --issue ORB-N` (this
   pass also checks labels + relations, which --file cannot).
6. Print the final table: identifier, title, repo, type, blockedBy, wave (from
   `node tools/wave-plan.mjs --project "<name>"`). When the tickets were routed into
   an existing project, that table covers the WHOLE project, so say which rows are
   the new ones.

Stop there. No code, no branches, no worktrees (D10: output is tickets, never a report
and never an implementation).
