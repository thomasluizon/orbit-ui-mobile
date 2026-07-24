---
name: orchestrate
description: Linear project (or single ticket) in, reviewed PRs out, wave by wave. Computes the merge-gated DAG with tools/wave-plan.mjs, reconciles each ticket against the code (D8), launches one Orca worktree + worker per ticket (engine from .claude/orchestrator.json, claude or codex), babysits CI and review, enforces the evidence gate (D7) and two-strikes (D9). A human merge is the only thing that advances a wave (D3). Use after /feature or /bug created the tickets.
argument-hint: <Linear project name or ORB-N>
effort: high
---

# /orchestrate: tickets -> waves of reviewed PRs

Constants: orca binary `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`,
team `ORB`. Config `.claude/orchestrator.json` (worker engine, parallel cap, repo
paths). The session always runs from orbit-ui-mobile (D17); worktrees open in whichever
repo a ticket's `repo:*` label names.

## 0. Read the contract

1. `orca linear list-issues --team ORB --project "<name>" --json` for the tickets.
   Note: the project description is only a 255-char pointer (Linear hard-caps it), and
   list payloads carry neither the description nor the content. The locked decisions,
   and for the #539 project only `targetBranch: redesign/main` (D36), live in the
   project OVERVIEW CONTENT. Read it first: resolve the project id via
   `orca linear project list`, read the personal key at
   `$env:USERPROFILE\.linear-api-key` into a variable (never echo it), then POST
   https://api.linear.app/graphql with header `Authorization: <key>` (the raw key) and
   query `project(id: "<id>") { name description content }`. Default target is `main`;
   orbit-api tickets always target `main` (D37).
2. `node tools/wave-plan.mjs --project "<name>"` prints the wave table. Show it.

## 1. Reconcile before dispatch (D8)

For each LAUNCHABLE ticket: open the files its body cites and confirm the stated
problem still reproduces on current `main`. A finding that no longer reproduces sends
the ticket back to Todo with a dated comment (`orca linear comment add`), never to a
worker. This applies equally to tickets written by humans, agents, or reviewers.

## 2. Launch a wave

Per launchable ticket, up to `maxParallelWorktrees`:

1. `node tools/check-ticket.mjs --issue ORB-N`; a defective ticket is fixed in Linear
   BEFORE launch, not patched in the prompt.
2. `orca worktree create --base-branch <target> --linear-issue ORB-N` in the repo the
   `repo:*` label names (repo ids in orchestrator.json).
3. `orca linear status set ORB-N --to "In Progress"`.
4. Compose the worker prompt: the ticket body VERBATIM (it is the prompt, D2), then the
   finishing contract: branch `feature/orb-N-<slug>` (or fix/), run lint + type-check +
   tests for the touched workspace, commit, push, open a PR to `<target>` whose body
   links `ORB-N`, attach the PR URL to the Linear issue (`orca linear attach`), attach
   the screenshot to the issue FIRST when the ticket carries `visible-effect` (D7),
   set the issue to In Review, and STOP. Workers never merge, never touch another
   ticket's files, never edit gate baselines.
5. `orca terminal create` in the worktree and `orca terminal send` the engine command
   from orchestrator.json (`claude -p ... "<prompt>"` or `codex exec "<prompt>"`);
   `orca terminal wait` for exit. Model routing (the flip orchestrator.json's notes
   name): a ticket labelled `worker:sonnet` swaps `--model opus` for `--model sonnet`
   in the claude args; every other ticket uses the configured args verbatim.

## 3. Babysit

Poll each launched ticket's PR (`gh pr checks`, `gh pr view --json reviewDecision`),
keyed by branch + head SHA + a fingerprint of the feedback already addressed, so the
same feedback is never replayed twice:

- CI red or CHANGES_REQUESTED: ONE fix cycle per strike; send the failure text + review
  comments to a fresh worker in the same worktree. Resolve addressed review threads.
- D7: an issue may sit In Review only with its PR attached, and with a screenshot
  attached when labelled `visible-effect`; otherwise demote to In Progress and finish.
- D9 two strikes: a second failed cycle sets the `attempts:2` label and the ticket is
  REFUSED further launches until its body is rewritten (two failures mean the spec is
  wrong, not the agent). wave-plan.mjs surfaces this.
- "All PRs green" requires reviewDecision APPROVED, not just checks passing.

## 4. Advance

Thomas merges. On his word (or on observing merges), fetch, re-run wave-plan, and
launch the newly launchable set. Repeat until the project has no unfinished tickets,
then print the final ledger: ticket, PR, merge SHA, evidence link.

Never: merge a PR, push to main, relaunch a two-strike ticket, or let a worker run
before Phase 1's gates are green on its target branch.

## Delegation discipline (the session-flood rule)

The orchestrating session ORCHESTRATES; it never implements. Measured 2026-07-24:
implementing inline flooded a main session to 611k tokens, while every delegated slice
landed clean. So:

- Every self-contained multi-file build or fix slice runs as a background agent with
  a branch + commit + PR + verification contract in its prompt (worktree or
  scratchpad-clone isolation when trees could collide).
- A CI failure or review finding on a delegated PR goes BACK to its author agent
  (SendMessage), never into the main session.
- The main session keeps only: decisions, small verification reads, user
  checkpoints, and cross-repo sequencing.
