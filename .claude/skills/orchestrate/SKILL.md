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

## 0. Classify the scope, then read the contract

The argument decides how far the run goes, and it is the FIRST thing to resolve
because it binds every later section. An `ORB-N` argument is **single-ticket
scope**. Anything else is **project scope**. Print the resolved scope as the run's
first output line, before any agent spawns, so the blast radius is visible while it
is still cheap to correct.

Single-ticket scope reconciles and launches THAT TICKET ONLY. It never reconciles a
sibling, never spawns an agent for one, and never advances a wave, because a wave is
a project-scope concept. It still reads whatever the one ticket needs from the
project overview.

This paragraph exists because the skill accepted both argument shapes while
documenting only the project flow, so `/orchestrate ORB-75` had no honest reading
except "resolve its project and run the project flow". Measured on the ORB-75 run:
three unrequested reconciliation agents for ORB-76, ORB-77 and ORB-79, about 230k
tokens, none of it asked for. The session followed the text; the text was the defect.

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
2. Compose the worker prompt into a file OUTSIDE every repo (the session scratchpad; a
   file written inside the worktree gets committed by the worker): the ticket body
   VERBATIM (it is the prompt, D2), then the finishing contract: run lint + type-check +
   tests for the touched workspace, commit, push, open a PR to `<target>` whose body
   links `ORB-N`, attach the PR URL to the Linear issue (`orca linear attach`), attach
   the screenshot to the issue FIRST when the ticket carries `visible-effect` (D7), set
   the issue to In Review, and STOP. Workers never merge, never touch another ticket's
   files, never edit gate baselines. The branch is NOT the worker's job; step 3 hands it
   the contract branch already checked out.
3. `node tools/launch-worker.mjs --issue ORB-N --prompt-file "<absolute path>"`
   (`--base-branch <target>` when the target is not `main`, `--branch-prefix fix` for a
   bug ticket, `--repo ui|api|landing` only to override the `repo:*` label). It prints
   the terminal handle, worktree path and branch as JSON: keep that, it is what you
   babysit with. A non-zero exit means NOTHING launched (1 the worker never reached
   tui-idle, 2 usage or config, 3 an orca or git command failed); read stderr, fix the
   cause, relaunch. Run `--dry-run` first if you want to see the resolved plan.
4. `orca linear status set ORB-N --to "In Progress"`.
5. `orca worktree set --worktree path:<worktreePath> --comment "<one line>"` at every
   LATER checkpoint (gates green, PR open, blocked), and `--workspace-status` to match.
   The comment is the worktree card's status line, so an empty one means the card reads
   as idle no matter what the worker is doing.

**What `launch-worker.mjs` handles for you**, all four measured on the 2026-07-24 ORB-75
launch, all four fatal to an unattended worker:

- **`orca worktree create` needs `--name`.** Without it the command exits 1 on
  `Missing required --name`. The tool passes the full working set:
  `--repo path:<repo> --name <slug> --base-branch <target> --linear-issue ORB-N
  --no-parent --comment "<one line>" --json`.
- **A fresh checkout blocks on Claude Code's workspace-trust prompt** ("Is this a project
  you created or one you trust?"), which surfaces as `orca terminal wait` returning
  `satisfied: false` with `blockedReason: codex-trust-workspace`. Nobody is at the
  keyboard, so the worker hangs there forever. The tool detects it on the blockedReason
  or on the terminal text, sends `1` + Enter, and waits again, bounded. Note that a wait
  which is simply not met yet comes back differently again, as exit 1 with an
  `ok: false` / `error.code: timeout` payload, so the tool reads the payload and never
  the exit code.
- **Orca's branch is not the contract branch.** Orca creates
  `refs/heads/<gituser>/<name>`; the worker contract needs `feature/orb-N-<slug>` (or
  `fix/`). The tool runs the `git switch -c` itself and verifies HEAD landed on it, so
  the branch never depends on the worker remembering.
- **The ticket body does not go through `terminal send --text`.** Multi-line markdown
  through a TUI submits early and arrives quoting-damaged. The tool sends a one-line
  pointer to the prompt FILE and the worker reads it, so the body reaches the worker
  byte-for-byte.

It also applies the model routing orchestrator.json's notes name: a ticket labelled
`worker:sonnet` swaps `--model opus` for `--model sonnet`; every other ticket uses the
configured args verbatim.

**Why not `claude -p`.** Headless mode is invisible to Orca: it is not a TUI, so the
worktree card shows no Agents row and clicking the card reveals only a bare shell.
Measured on the ORB-75 Phase 7 run, where the card read `agents: none` with an empty
comment for the worker's entire life and death. A TUI worker populates the card's Agents
row with its live prompt, current tool and elapsed time, which is the only in-Orca window
into a running worker.

`claude -p` is not the only way to get there: `codex exec` is Codex CLI's non-interactive
subcommand and lands in exactly the same place, and flipping the top-level `worker` key is
a one-word edit (D5). So the guard is not a flag check. Every entry in
`orchestrator.json`'s `workers` map must declare `interactive: true`, and
`launch-worker.mjs` refuses (exit 2) to launch anything that does not, with a second
assertion catching an entry that declares itself interactive while carrying `-p`,
`--print` or `exec`. `codex` is declared `interactive: false` today, so selecting it fails
loudly at launch rather than producing an unsupervisable run; making it usable again means
giving it an interactive invocation, not deleting the flag.

Two consequences of dropping `-p`. The process does NOT exit when the work is done, so
wait with `--for tui-idle`, never `--for exit`. And the permission mode must still come
from orchestrator.json (`bypassPermissions`), because an interactive worker with nobody
at the keyboard is just as stuck as a headless one.

## 3. Babysit

**tui-idle is not completion.** It cannot tell "finished the contract" apart from "stopped
early" or "waiting on a prompt that will never come". Measured 2026-07-24 on ORB-75: the
waiter returned `satisfied: true` and that was read as done, while the worktree held 14
modified and 7 untracked files with zero commits, no push, no PR, and the issue still In
Progress. So idle is a trigger to CHECK, never a report of success:

```
node tools/worker-status.mjs --worktree <worktreePath> --issue ORB-N [--base <target>]
```

It derives the verdict from artifacts (commits above the base, a clean worktree, the branch
pushed, a PR open against the target, the issue In Review with the PR attached, and an image
attached when the ticket is `visible-effect`, D7) and exits non-zero listing exactly what is
unmet. That list is what you nudge with. Nothing else counts as "done".

**Never `terminal send` to a worker that is not idle.** Measured on the same run: a send
issued mid-turn never became a user turn at all. It appears in the worker's session
transcript only as `queue-operation` records, and the running turn was cut short on a
mid-flow sentence. Everything a worker needs belongs in its prompt FILE at launch. When new
information arrives mid-run, append it to that file and point the worker back at it:

```
node tools/nudge-worker.mjs --terminal <handle> --prompt-file <path> < update.md
node tools/nudge-worker.mjs --terminal <handle> --text "<one line>"
```

Either form waits for tui-idle first and REFUSES with exit 1 (sending nothing) while the
worker is busy, so a mid-turn send is not reachable through the sanctioned path.

Then poll each launched ticket's PR (`gh pr checks`, `gh pr view --json reviewDecision`),
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

**Project scope only.** Thomas merges. On his word (or on observing merges), fetch,
re-run wave-plan, and launch the newly launchable set. Repeat until the project has
no unfinished tickets, then print the final ledger: ticket, PR, merge SHA, evidence
link.

**Single-ticket scope ends here instead.** The run is complete once that one
ticket's PR is open and its issue is In Review with the PR attached (plus the
screenshot when it carries `visible-effect`). Print that ticket's ledger row and
STOP. A merge of that ticket is not a trigger to launch anything: observing it may
have opened a wave, but the run Thomas asked for was one ticket. Tell him which
tickets became launchable and let him decide, rather than deciding for him.

Never: merge a PR, push to main, relaunch a two-strike ticket, or let a worker run
before Phase 1's gates are green on its target branch.

## A run RECORDS harness defects, it never repairs them

A HARNESS defect is anything wrong with the launch, the waiter, the gates, this skill, or
`.claude/orchestrator.json`. A TICKET defect is a different animal and D9 already owns it
(two failures mean the body is wrong, not the agent). This section covers the harness only;
never conflate the two.

**A run cannot certify its own harness.** The session that built the previous harness passed
its own checks; an independent fresh-eyes session then found 7 Critical/High defects in the
same commit range, and 4 of the 7 were reachable only by running the documented sequence end
to end and watching a later step silently destroy an earlier one. Reading the diff did not
find them. Two more costs of fixing in-run: the run stops converging, because every harness
detour competes with delivering the ticket; and a run that edits the skill it is executing
changes its own contract halfway through, so nothing it reports afterwards describes one
consistent system.

So, on hitting a harness defect mid-run:

1. Append ONE line to the run's defect ledger: what broke, the measured evidence, and the
   workaround used to keep going. Then keep going.
2. Never edit this skill, `.claude/orchestrator.json`, a tool under `tools/`, or a CI gate
   from inside a run.
3. At the end of the run, if the ledger is non-empty, create ONE Linear ticket in the
   Backlog project (`757e1ced-43e9-4459-b7eb-3ade25dc1919`, team ORB) carrying EVERY harness
   defect that run found, each with its evidence and its workaround. One ticket per RUN,
   never one per defect; it must pass `node tools/check-ticket.mjs --issue ORB-N` like any
   other ticket. An empty ledger creates nothing: silence is correct when nothing broke.
4. Name that ticket in the closing report alongside the per-ticket ledger, so a run ends as
   a work list rather than as silence.

Linear rather than printed output, because D10: an audit's output is tickets, never a
report. A report is a photograph that starts lying the day after it is written, and a list
printed into a session dies with the session.

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

### Waiting is foreground work, on both sides

A stopped agent receives no notifications, so a background waiter it armed can never wake
it: ending a turn with the goal unmet records the task as idle, and only a human nudge
restarts it. Measured 2026-07-24: three agents in one day (the ui merge-chain, the Phase 3
deletion, the orchestrate-skill fix) each ended their turn on "the monitor will notify me"
with no live background child. Two of the three prompts already carried a warning against
exactly that, so the subagent-side half alone does not hold. Both halves are the rule:

- **In a prompt whose task includes waiting on CI or a review:** poll in the FOREGROUND,
  sleep 60 to 120s per loop, inside your own turn. End the turn only on the goal state or a
  genuinely unfixable blocker, and say which one.
- **On any completion notification whose result reads "waiting", "standing by", or "monitor
  armed":** read the real PR/CI state yourself and send the agent back to work with it.
  Standing by is not progress.
