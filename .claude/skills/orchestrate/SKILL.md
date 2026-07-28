---
name: orchestrate
description: Linear project (or single ticket) in, reviewed PRs out, wave by wave. Computes the merge-gated DAG with tools/wave-plan.mjs, reconciles each ticket against the code (D8), launches one Orca worktree + worker per ticket (engine from .claude/orchestrator.json, claude or codex), babysits CI and review, enforces the evidence gate (D7) and two-strikes (D9), then tears down each worktree immediately after verified Done. A human merge is the only thing that advances a wave (D3), unless --sleep is passed. Scope is the whole project unless --single bounds it to one ticket. Use after /feature or /ticket created the tickets.
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

## 0a. Prove scope completeness before any worker starts

For every ticket this run may launch, read and execute
`.claude/skills/_shared/scope-completeness.md` against its target repo and the brain vault.
Print that ticket's list before any worker starts and append it verbatim to the worker
prompt. No ticket reaches dispatch with an unchecked or unaccounted entry.

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
- **A non-blocking review is still work.** `pr-watch.mjs` reports `review-comment` as its own
  transition for exactly this reason. Sweep both endpoints (`gh api .../pulls/<n>/comments`
  for inline threads and `gh pr view <n> --json reviews` for `COMMENTED` bodies) on every
  head, not only when the verdict moves. Each finding is reconciled against the code (D8),
  then fixed and its thread resolved, or disputed with a written reply. Never merge over an
  untouched comment: `reviewDecision` cannot see it. This is condition 6 in 4a, and it binds
  the awake path too, where it is Thomas's merge that it gates rather than the run's.
- D7: an issue may sit In Review only with its PR attached, and with a screenshot
  attached when labelled `visible-effect`; otherwise demote to In Progress and finish.
- D9 two strikes: a second failed cycle sets the `attempts:2` label and the ticket is
  REFUSED further launches until its body is rewritten (two failures mean the spec is
  wrong, not the agent). wave-plan.mjs surfaces this.
  **Under `--sleep`, the run performs that rewrite itself rather than stalling until
  morning** (Thomas, 2026-07-27). Diagnose from the two failed attempts WHY the spec was
  wrong, rewrite the body in Linear, re-run `node tools/check-ticket.mjs --issue ORB-N`,
  and relaunch exactly ONCE.
  **REMOVE the `attempts:2` label as part of that relaunch**, once the rewritten body passes
  `check-ticket.mjs` and before the worker starts. Without that step the feature is inert:
  4a condition 5 refuses to merge any ticket carrying `attempts:2`, so a rewritten ticket
  that then went fully green would still stop unmerged, which is the exact stall this
  paragraph exists to prevent. A third failure RESTORES the label: put `attempts:2` back,
  launch nothing further, and report it. The rewrite, its reasoning and the diff against the
  original body all go in the closing report, because an agent editing its own work order
  unsupervised is exactly the thing that must be auditable afterwards. Without `--sleep`
  this does not apply: a human is awake, and the rewrite is theirs.
- "All PRs green" requires reviewDecision APPROVED, not just checks passing.

## 4. Advance

**Project scope, the default.** Thomas merges. On his word (or on observing merges),
fetch, verify the Linear issue is Done, then immediately run
`node tools/teardown-worktree.mjs --issue ORB-N` for that ticket. It is evidence-gated:
if it refuses, leave the tree untouched, record the failed check, and do not call the
ticket cleaned up. On confirmed removal, record the removed worktree path in that
ticket's ledger row. Then re-run wave-plan and launch the newly launchable set. Repeat
until the project has no unfinished tickets, then print the final ledger: ticket, PR,
merge SHA, evidence link, removed worktree. This holds whether the run was invoked with
a project name or with a single `ORB-N`, because without `--single` a ticket argument
names where to start, not where to stop.

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
6. **Every comment from every reviewer is addressed, whatever its review state.**
   `reviewDecision` only reflects reviews that BLOCK. A `COMMENTED` review and an inline
   comment thread do not move it, so a PR can read `APPROVED` while carrying unaddressed
   findings. Measured on PR #621, 2026-07-27: the Codex connector posted two P1 inline
   comments, `reviewDecision` stayed `APPROVED`, and conditions 1 to 5 alone would have
   merged both defects. One of the two was a real mechanical break that the blocking
   reviewer had missed entirely.

   So enumerate them yourself, from BOTH endpoints, because they are different objects:
   `gh api repos/<owner>/<repo>/pulls/<n>/comments` (inline threads) and
   `gh pr view <n> --json reviews` (review bodies, including `COMMENTED` ones). Then each
   comment ends in exactly one of two states:

   - **Addressed.** The finding is real: fix it through a worker in that ticket's worktree,
     PUSH the fix, then reply on the thread naming the commit that fixed it, then RESOLVE
     the thread. That order matters: resolving before the fix is pushed marks a defect
     handled that is not yet in the branch. Re-read the checks and `reviewDecision`
     afterwards, because the fix pushed a new head.
   - **Disagreed.** Reconcile the finding against the code first (D8): a reviewer can be
     wrong, and a finding that does not reproduce is not work. Post a reply saying plainly
     why you disagree, with the evidence you checked. Then **STOP that ticket**: leave the
     PR open, do not merge it, and put the disagreement in the closing report. A reviewer
     and the run disagreeing is precisely a case the run cannot decide alone. Leave that
     thread UNRESOLVED: it is the one case where an open thread is the correct end state,
     because Thomas has to settle it.

   A comment that is purely informational, with nothing to fix and nothing to dispute, is
   addressed by a reply saying so, and then resolved. Silence is never "addressed".

   **Check this mechanically, never by memory.** A thread is resolved only when GitHub says
   so, and "I replied to it" is not resolution: an unresolved thread is what Thomas actually
   sees when he opens the PR, which is the entire point of this condition.

   ```bash
   gh api graphql -f query='query{repository(owner:"<owner>",name:"<repo>"){pullRequest(number:<n>){reviewThreads(first:100){nodes{id isResolved comments(first:1){nodes{author{login} body}}}}}}}' \
     --jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved==false)]|length'
   ```

   That number must be `0` before a `--sleep` merge, with the single exception of a thread
   deliberately left open by the disagreement path above, and that ticket is not being
   merged anyway. Resolve with:

   ```bash
   gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"<PRRT_...>"}){thread{isResolved}}}' \
     --jq '.data.resolveReviewThread.thread.isResolved'
   ```

   Read that mutation's `true` back rather than assuming it worked. Thomas must never wake
   up to a merged PR carrying open threads whose findings were in fact fixed hours earlier;
   from the outside those two states look identical, and one of them is a lie.

Then squash-merge and delete the branch. **Never `--admin`.** Admin-merging bypasses
the checks, and a bypass with nobody watching is the one combination that can put a
broken commit on `main` and leave it there until morning.

On anything the run cannot decide from those five checks, do NOT guess and do NOT
pick a middle path. Stop that ticket, leave its PR open, record the reason, and carry
on with the others. A single stuck ticket must never stall the rest of the wave.

The run's closing report is written for someone with no memory of the run, because that
is what Thomas is when he reads it. Five sections, in this order, every one present even
when empty:

1. **Merged**, one line each: ticket, PR, merge SHA, and the count of reviewer comments
   addressed on it. Every merged PR must read zero unresolved threads; say so, because an
   unresolved thread on a merged PR is the thing this report exists to make impossible.
2. **Stopped**, with the exact reason and what it is waiting on. A ticket stopped because
   the run DISAGREED with a reviewer names the comment, the reply posted, and the evidence
   checked, so Thomas can settle it in one read.
3. **Anything that would have been a question.** The most important section; never
   compress it. Every fork the run decided alone belongs here with its reasoning.
4. **Harness defects**: the ledger, the ticket it became, and the PR that permanently
   fixed each one, or why one could not be fixed unattended.
5. **Anything that reproduced differently from what its ticket claimed**, because that
   means a ticket body is lying and Thomas needs to know which one.

Never: push to main, merge with `--admin`, merge a PR that fails any of the five
checks above, or let a worker run before Phase 1's gates are green on its target
branch. Merging a PR is forbidden too, EXCEPT under `--sleep` on the terms in 4a.
Relaunching a two-strike ticket is forbidden except through the single audited rewrite
`--sleep` authorises in section 3.

## Harness defects: RECORD during the run, REPAIR after it

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

### Then REPAIR the ledger, permanently, as the run's last act

Recording is how a defect survives the run without corrupting it. It is not where the defect
ends. Thomas's standing rule (2026-07-27): **a one-time fix is not a fix; a defect is resolved
only when it cannot recur.** A run that files a ticket and stops has deferred the work, and
the same defect then taxes every later run until somebody schedules it.

So once every ticket in the run is merged or stopped, and NOTHING is still executing:

1. **The run ticket stays the record; each defect gets its own CHILD ticket to be fixed
   from.** The aggregate ticket above is one per RUN and cannot carry N repair PRs: it would
   close on the first merge, leaving the rest with no live issue to launch from, attach to or
   close, and `launch-worker.mjs` derives the worktree name and branch from the issue, so two
   PRs off one issue collide before that even matters. So file one child ticket per ledger
   entry (`orca linear create --parent <run ticket>`), each passing `check-ticket.mjs`, each
   describing ONE defect. A ledger with exactly one entry needs no child: the run ticket is
   already that shape.
2. Work the children one PR per ticket, through the same worker machinery as any ticket. The
   run is over, so editing `tools/`, this skill or `.claude/orchestrator.json` no longer
   changes a contract anything is executing.
3. Each fix ships the GATE that makes the defect impossible, not only the repair. A test in
   `tools/test-tools.mjs`, a case in `.claude/hooks/test-hooks.mjs`, or a `guards.yml` job.
   A repair with no gate is a one-time fix and does not close the ledger entry.
4. The parent run ticket closes only when every child is Done. Never skip the ticket layer to
   save a step: a defect fixed with no ticket leaves no trace of why the gate exists.
5. A defect the run genuinely cannot fix unattended stays an open child ticket, and the report
   says which one and why.

The ordering is the whole point: **record during, repair after.** Both halves are required,
and doing the second one first is the failure this section's opening paragraphs describe.

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
