---
name: orchestrate
description: Linear project (or single ticket) in, reviewed PRs out, wave by wave. Computes the merge-gated DAG with tools/wave-plan.mjs, reconciles each ticket against the code (D8), launches one Orca worktree + worker per ticket (engine from .claude/orchestrator.json, claude or codex), babysits CI and review, enforces the evidence gate (D7) and two-strikes (D9). A human merge is the only thing that advances a wave (D3), unless --sleep is passed. Scope is the whole project unless --single bounds it to one ticket. Use after /feature or /bug created the tickets.
argument-hint: <Linear project name or ORB-N> [--single] [--sleep]
effort: high
---

# /orchestrate: tickets -> waves of reviewed PRs

Constants: orca binary `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`,
team `ORB`. Config `.claude/orchestrator.json` (worker engine, parallel cap, repo
paths). The session always runs from orbit-ui-mobile (D17); worktrees open in whichever
repo a ticket's `repo:*` label names.

## 0. Classify the scope, then read the contract

The `--single` FLAG decides how far the run goes, not the argument shape, and it is
the FIRST thing to resolve because it binds every later section.

- **Default, flag absent: project scope.** A project name runs that project. An
  `ORB-N` argument resolves to the project that ticket belongs to and runs the whole
  project from that ticket's wave onward. This is the behaviour to preserve; a
  ticket argument is a starting point, not a boundary.
- **`--single` present: single-ticket scope.** Only valid with an `ORB-N` argument.
  Reconcile and launch THAT TICKET ONLY. Never reconcile a sibling, never spawn an
  agent for one, never advance a wave. `--single` on a project name is a usage error:
  say so and stop rather than guessing which ticket was meant.

`--sleep` is a separate, orthogonal flag: it says Thomas is asleep, so the run must
never ask a question and must merge its own PRs. It combines with either scope.
Section 4a is its full contract; read it before using it.

Print the resolved scope, and whether `--sleep` is on, as the run's first output
line, before any agent spawns, so the blast radius is visible while it is still
cheap to correct.

The flag exists because the skill previously accepted both argument shapes while
documenting only the project flow, so the reader could not tell which one an `ORB-N`
argument selected. Measured on the ORB-75 run: three reconciliation agents for
ORB-76, ORB-77 and ORB-79 that Thomas had not asked for, about 230k tokens. Widening
was the RIGHT default and stays the default; what was missing was a way to say no.

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
   file written inside the worktree gets committed by the worker) with
   `node tools/compose-prompt.mjs --issue ORB-N --output "<absolute path>"`. It carries
   the ticket body VERBATIM (it is the prompt, D2) and every chronological issue comment.
   Append the PER-TICKET finishing contract: run lint + type-check + tests for the touched
   workspace, commit, push, open a PR to `<target>` whose body links `ORB-N`, attach the PR
   URL to the Linear issue (`orca linear attach`), attach the screenshot to the issue FIRST
   when the ticket carries `visible-effect` (D7), set the issue to In Review, and STOP. The
   branch is NOT the worker's job; step 3 hands it the contract branch already checked out.

   **Do NOT hand-write the STANDING clauses here.** Never ask a question, state a blocked
   criterion as UNMET instead of stalling, never watch your own PR's CI or another
   ticket, never arm a monitor that outlives the contract, never merge: all of that is
   `WORKER_CONTRACT` in `tools/launch-worker.mjs`, which APPENDS it to your prompt file
   at launch (idempotently). The guarantee is structural precisely because it used to be
   prose in this list: on the ORB-88 run a worker whose hand-composed prompt omitted the
   clauses ended a turn on a question and stalled until a human noticed the terminal, and
   then armed a monitor on another ticket's PR. `tools/test-tools.mjs` fails if a clause
   is dropped, so the Harness Execution job is what keeps it true, not this paragraph.
3. `node tools/launch-worker.mjs --issue ORB-N --prompt-file "<absolute path>"`
   (`--base-branch <target>` when the target is not `main`, `--branch-prefix fix` for a
   bug ticket, `--repo ui|api|landing` only to override the `repo:*` label). It prints
   the terminal handle, worktree path and branch as JSON: keep that, it is what you
   babysit with. Exit 0 means the worker ACCEPTED the prompt as a user turn, read back off
   the TUI, not merely that orca accepted the send. On a non-zero exit (1 the worker never
   reached tui-idle or never took the pointer, 2 usage or
   config, 3 an orca or git command failed) the tool rolls its own worktree and branches
   back out, so relaunching after fixing the cause starts clean rather than piling up
   `orb-N-slug-2` with a surviving contract branch that fails `git switch -c` all over
   again. If it could not remove the worktree (a wedged setup PTY), it prints the exact
   removal command on stderr; run that BEFORE relaunching. Read stderr, fix the cause,
   relaunch. Run `--dry-run` first if you want to see the resolved plan.
4. `orca linear status set ORB-N --to "In Progress"`.
5. `orca worktree set --worktree path:<worktreePath> --comment "<one line>"` at every
   LATER checkpoint (gates green, PR open, blocked), and `--workspace-status` to match.
   The comment is the worktree card's status line, so an empty one means the card reads
   as idle no matter what the worker is doing.

**What `launch-worker.mjs` handles for you**, every one measured on a real launch, every one
fatal to an unattended worker:

- **`orca worktree create` needs `--name`.** Without it the command exits 1 on
  `Missing required --name`. The tool passes the full working set:
  `--repo path:<repo> --name <slug> --base-branch <target> --linear-issue ORB-N
  --no-parent --comment "<one line>" --json`.
- **A fresh checkout blocks on the worker CLI's workspace-trust prompt**, which surfaces
  as `orca terminal wait` returning `satisfied: false` with a `blockedReason`. Nobody is
  at the keyboard, so the worker hangs there forever. The tool detects it on the terminal
  text, answers it once and waits again, bounded. The screen text, the blockedReason AND
  the answering keystroke all differ per engine, so they live in `ENGINE_PROFILES`:
  Claude Code paints "Is this a project you created or one you trust?", reports
  `codex-trust-workspace`, and takes `1` + Enter; codex paints "Do you trust the contents
  of this directory?", reports `codex-interactive-prompt`, and takes **Enter alone**,
  because its list preselects option 1 and says so ("Press enter to continue"). Sending
  codex the digit was measured leaving its process exited (-1). Two matching subtleties:
  the tool checks `satisfied` BEFORE the screen text, because a TUI repaint has no
  scrollback and the answered trust screen stays in the tail forever, and it matches that
  tail with all whitespace stripped, because `orca terminal read` swallows spacing
  unevenly ("Doyoutrustthecontents..."). Note also that a wait which is simply not met yet
  comes back differently again, as exit 1 with an `ok: false` / `error.code: timeout`
  payload, so the tool reads the payload and never the exit code.
- **Orca's branch is not the contract branch.** Orca creates
  `refs/heads/<gituser>/<name>`; the worker contract needs `feature/orb-N-<slug>` (or
  `fix/`). The tool runs the `git switch -c` itself and verifies HEAD landed on it, so
  the branch never depends on the worker remembering.
- **The ticket body does not go through `terminal send --text`.** Multi-line markdown
  through a TUI submits early and arrives quoting-damaged. The tool sends a one-line
  pointer to the prompt FILE and the worker reads it, so the body reaches the worker
  byte-for-byte.
- **An accepted send is not a delivered prompt.** Measured on the 2026-07-27 ORB-88 launch:
  orca accepted the pointer, the launcher printed a full plan and exited 0, and the pointer
  never became a user turn. The TUI sat at an empty composer with its placeholder still
  painted, alive and idle with no work, and would have sat there until a human noticed.
  `waitAttempts: 1` was the clue: on a cold TUI, reaching tui-idle on the first wait means the
  composer had not finished mounting, and the send went into nothing. So the tool now READS THE
  POINTER BACK off the terminal after sending, re-sends up to three times, and exits 1 (rolling
  the worktree out) if the pointer never appears; the plan reports `pointerSends`. A repainting
  TUI is never sent to twice: it settles and re-reads instead, because a second send into a busy
  worker is the ORB-75 corruption.

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
assertion catching an entry that declares itself interactive while carrying its CLI's
headless token anywhere in its `command` OR its `args` (a guard that reads only `args` is
one field move from passing `"command": "codex exec"`).

That second assertion is **per engine**, keyed by the binary, because headless is a
property of the CLI: `exec` (and its alias `e`) for codex, `-p` / `--print` for claude.
One shared token list cannot tell codex's `-p`, which is `--profile`, apart from claude's
`-p`, which is `--print`, and rejected every valid `codex --profile` invocation as
headless. A binary with no `ENGINE_PROFILES` entry is refused rather than waved through,
so adding a third engine means declaring what headless looks like for it.

**codex is a usable engine.** Its entry is bare `codex` with no subcommand
(`codex --help`: "If no subcommand is specified, options will be forwarded to the
interactive CLI") plus `--dangerously-bypass-approvals-and-sandbox`, which is codex's
`bypassPermissions`. Never `--full-auto`: that is `-a on-request --sandbox
workspace-write`, and `on-request` lets the MODEL decide when to ask a human who is not
there. The single bypass flag is preferred over the equivalent pair
`-a never --sandbox danger-full-access` because the pair has a half-state, where an edit
dropping `-a never` silently restores approval prompts to an unwatched worker. On Windows
the entry also carries `-c windows.sandbox="unelevated"`: codex's default Windows sandbox
needs Administrator rights to set up, and its first-run TUI otherwise sits on "Setting up
sandbox... Input disabled until setup completes" forever in a PTY with no desktop to raise
UAC on, while `orca terminal wait` reports `satisfied: true` throughout. The prerequisite
the harness cannot supply is the account: a paid ChatGPT plan and `codex login`
(`codex login --device-auth` works from a headless session, printing a URL and a one-time
code). Making codex the DEFAULT is still a separate decision (D5) and Thomas's call; this
only makes selecting it work.

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

It derives the verdict from artifacts (commits above the freshly fetched `origin/<target>`,
never a stale local ref, a clean worktree, the branch
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

**What the fleet is doing right now** is `/watch` (`tools/worker-watch.mjs`): per worktree, the
ticket, the branch, the Linear state, BUSY or IDLE by repaint delta, the last meaningful output
lines, and the contract verdict above. Liveness and delivery answer different questions, and
`IDLE + NOT MET` is the pair that costs a run: a worker that stopped on a question with nobody
at the keyboard. Read it instead of hand-running `orca terminal read`, which returns a busy
worker's tail as thousands of characters of concatenated `Working` fragments.

Then watch each launched ticket's PR with the tool, never a hand-written poll loop:

```
node tools/pr-watch.mjs --repo <owner/name> --pr <n> --acted <n>=<sha>:<verdict>
```

It exits on the first state you have NOT already acted on and names which one: `gone` (merged
or closed, exit 5), `checks-failed` (exit 1), `changes-requested` or `review-comment` (exit 1),
`approved` / `ready-to-merge` (exit 0), `timeout` (exit 4). `--acted` is what you have already
handled on that PR, as the head SHA the verdict sat on plus the verdict; pass it after every fix
cycle so the same feedback is never replayed, and pass nothing on the first watch. A verdict
counts only when it sits on the CURRENT head, so a stale `CHANGES_REQUESTED` carried on an older
commit does not satisfy it.

Write no loop of your own. Both hand-rolled loops on the ORB-88 run were wrong and both failed
silently: the first fired instantly on a stale verdict from an earlier commit, the second could
only exit on approval or a failing check, so a fresh CHANGES_REQUESTED left it spinning for
90 minutes with the answer in its own output and nobody reading it. The terminal condition is
"anything other than the state I have already acted on", never an allowlist of the states
somebody remembered.

- CI red or CHANGES_REQUESTED: ONE fix cycle per strike; send the failure text + review
  comments to a fresh worker in the same worktree. Resolve addressed review threads.
- D7: an issue may sit In Review only with its PR attached, and with a screenshot
  attached when labelled `visible-effect`; otherwise demote to In Progress and finish.
- D9 two strikes: a second failed cycle sets the `attempts:2` label and the ticket is
  REFUSED further launches until its body is rewritten (two failures mean the spec is
  wrong, not the agent). wave-plan.mjs surfaces this.
- "All PRs green" requires reviewDecision APPROVED, not just checks passing.

## 4. Advance

**Project scope, the default.** Thomas merges. On his word (or on observing merges),
fetch, re-run wave-plan, and launch the newly launchable set. Repeat until the
project has no unfinished tickets, then print the final ledger: ticket, PR, merge
SHA, evidence link. This holds whether the run was invoked with a project name or
with a single `ORB-N`, because without `--single` a ticket argument names where to
start, not where to stop.

**`--single` ends here instead.** The run is complete once that one ticket's PR is
open and its issue is In Review with the PR attached (plus the screenshot when it
carries `visible-effect`). Print that ticket's ledger row and STOP. A merge of that
ticket is not a trigger to launch anything: observing it may have opened a wave, but
the run was explicitly bounded. Name the tickets that became launchable so Thomas can
start them, and do not start them.

## 4a. `--sleep`: no questions, and the run merges its own PRs

`--sleep` means Thomas is asleep. It suspends exactly one thing, the human merge of
D3, and nothing else. Every gate stays where it is; the flag removes the reviewer
from the loop, never the review.

**This is a deliberate, Thomas-authorised exception to D3** ("a human merge is the
only thing that advances a wave"), and to the `Never: merge a PR` line below. Say so
in the run's opening line, so a reader of the transcript is never left wondering
whether the run went rogue.

Merge a PR under `--sleep` only when ALL of these hold, checked in this order:

1. `reviewDecision` is `APPROVED`. Not `REVIEW_REQUIRED`, not `null`, and never
   `CHANGES_REQUESTED`. A passing `review` check is not approval.
2. Every check has concluded and none failed. A `PENDING` / `QUEUED` / `IN_PROGRESS`
   check means wait, not proceed.
3. `mergeStateStatus` is `CLEAN`. `BEHIND` means update the branch and re-read BOTH
   the checks and `reviewDecision` afterwards, because updating invalidates them.
4. The D7 evidence gate is satisfied: the PR is attached to the issue, and a
   `visible-effect` ticket has its screenshot attached.
5. The ticket carries no `attempts:2` label (D9 refuses it regardless of colour).

Then squash-merge and delete the branch. **Never `--admin`.** Admin-merging bypasses
the checks, and a bypass with nobody watching is the one combination that can put a
broken commit on `main` and leave it there until morning.

On anything the run cannot decide from those five checks, do NOT guess and do NOT
pick a middle path. Stop that ticket, leave its PR open, record the reason, and carry
on with the others. A single stuck ticket must never stall the rest of the wave.

The run's closing report lists, separately: PRs merged while asleep with their SHAs,
tickets stopped and why, and anything that would have been a question. That list is
the first thing Thomas reads when he wakes up, so it is written for someone with no
memory of the run.

Never: push to main, merge with `--admin`, merge a PR that fails any of the five
checks above, relaunch a two-strike ticket, or let a worker run before Phase 1's
gates are green on its target branch. Merging a PR is forbidden too, EXCEPT under
`--sleep` on the terms in 4a.

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
- The launcher carries the same delegation rule to every worker: a multi-file work order or
  review round fans independent slices or findings out one subagent each, with explicit output
  contracts. Same-file edits and the final raw gate run stay inline so agents cannot conflict
  and PR evidence remains first-hand.

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
