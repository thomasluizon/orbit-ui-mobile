---
name: orchestrate
description: Linear project, single ticket, or explicit ticket set in, reviewed PRs out, wave by wave. Computes the merge-gated DAG with tools/wave-plan.mjs, preflights every target repo before worktree creation, reconciles each ticket against the code (D8), launches one Orca worktree + worker per ticket (engine from .claude/orchestrator.json, claude or codex), lets workers own automated review, adjudicates escalations, performs one pre-merge verification per ticket, enforces the evidence gate (D7) and two-strikes (D9), then tears down each worktree immediately after verified Done. A human merge is the only thing that advances a wave (D3), unless --sleep is passed. Scope is the whole project for a name or one ticket argument, one ticket under --only, or exactly the named tickets when two or more are supplied; --single runs that resolved scope serially. Use after /feature or /ticket created the tickets.
argument-hint: <Linear project name | ORB-N [ORB-N ...]> [--only] [--single] [--sleep]
effort: high
---

# /orchestrate: tickets -> waves of reviewed PRs

Constants: orca binary `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`,
team `ORB`. Config `.claude/orchestrator.json` (worker engine, parallel cap, repo
paths). The session always runs from orbit-ui-mobile (D17); worktrees open in whichever
repo a ticket's `repo:*` label names.

## 0. Classify the scope, then read the contract

Classify by the number of `ORB-N` identifiers after splitting on spaces and commas:

- **Zero identifiers: project scope.** The remaining name runs that project.
- **One identifier: project or single-ticket scope.** Without `--only`, resolve
  the ticket's project and run it from that ticket's wave onward. The ticket is a
  starting point, not a boundary. With `--only`, reconcile and launch THAT TICKET
  ONLY. Never reconcile a sibling, spawn an agent for one, or advance a wave.
- **Two or more identifiers: explicit-set scope.** Deduplicate the identifiers while
  preserving their first-seen order, then run exactly those tickets and nothing else.
  `--only` with an explicit set is a usage error: say that `--only` means one-ticket
  scope and `--single` is the serial concurrency flag, then stop. Resolve every member
  before doing any work; an identifier that
  does not resolve or is already Done is an error for the set, never a reason to
  silently shrink it.

`--only` on a project name is also a usage error: name both flags by saying that
`--only` requires one `ORB-N` identifier and `--single` serialises a project run,
then stop. `--single` is valid with every resolved scope, including an explicit set,
and does not change which tickets belong to it. It sets the invocation's effective
`maxParallelWorktrees` to 1 through the same cap enforcement as every other run.
Wait for each ticket to reach a terminal state before launching the next. `--only`
and `--single` may be combined for a one-ticket serial run.

`--sleep` is a separate, orthogonal flag: it says Thomas is asleep, so the run must
never ask a question and must merge its own PRs. It combines with any scope.
Section 4a is its full contract; read it before using it.

Print the resolved scope, and whether `--sleep` is on, as the run's first output
line, before any agent spawns, so the blast radius is visible while it is still
cheap to correct. Use `SCOPE: <project | single ticket | explicit set> [<resolved
name or deduplicated members>]; sleep: <on | off>`. Usage errors stop before this
line because no scope was resolved.

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

For explicit-set scope, run
`node tools/wave-plan.mjs --issues ORB-a,ORB-b` instead. It resolves blockers
against the full team DAG while displaying only the requested members. Refuse each
blocked member with every unmerged blocker named, and continue with the other
launchable members. Apply sections 1 through 3 and every D7, D8, D9 and
`check-ticket.mjs` gate independently to each member that proceeds.

## 0a. Prove scope completeness before any worker starts

For every ticket this run may launch, read and execute
`.claude/skills/_shared/scope-completeness.md` against its target repo and the brain vault.
Print that ticket's list before any worker starts and append it verbatim to the worker
prompt. Before dispatch, every affected occurrence must be identified as a checkbox entry,
and every entry must be accounted for by assigning it to a specific ticket in this run or
explicitly marking it out of scope with a reason. An unchecked box is the normal
pre-dispatch state: it tracks completion and is checked by the implementation worker as the
work lands. No ticket reaches dispatch with an omitted category or an unaccounted entry.

## 0b. Preflight the launch environment

Before Phase 1, and before creating ANY worktree, run the fast environment preflight
for every target repo represented by the launchable set:

```
node tools/preflight.mjs --repo <ui|api|landing> --base-branch <target> [--require <cli> ...]
```

The tool checks the selected worker invocation, GitHub CLI installation and
authentication, Orca reachability, the target repo's branch and cleanliness, and the
core CLIs the run needs. Read every launchable ticket first and append one repeated
`--require <cli>` for each ticket-specific CLI it names beyond those repo defaults.
This checks only that the executable exists; authenticating a third-party service stays
with the ticket. Print the complete PASS/FAIL table as part of the run transcript. Exit
0 is the only permission to continue for that repo. On any non-zero exit, report the
table exactly, create no worktrees, attempt no repair, and STOP the run. A preflight
failure is an environment defect to surface, not a condition the orchestrator silently
fixes.

## 1. Reconcile before dispatch (D8)

For each LAUNCHABLE ticket: open the files its body cites and confirm the stated
problem still reproduces on current `main`. A finding that no longer reproduces sends
the ticket back to Todo with a dated comment (`orca linear comment add`), never to a
worker. This applies equally to tickets written by humans, agents, or reviewers.

## 2. Launch a wave

Per launchable ticket, up to the effective `maxParallelWorktrees`: the configured
cap for a normal run, or 1 when `--single` is present. `tools/launch-worker.mjs`
enforces that cap against the target repo's live Orca worktrees before creating a
worktree or branch. It serialises the live inventory and worktree creation per
target repo, so concurrent launch processes cannot claim the same final slot. A
refusal names the cap, observed count, and every worktree holding a slot. The
repository's main worktree and archived child worktrees do not consume slots.

For an explicit set larger than the cap, keep the remaining members in first-seen
order. Launch the next member only when `tools/worker-status.mjs` reports that a
running member has completed its contract and freed a slot. The cap is a concurrency
limit, not a batch size: never launch above it, truncate the set, or wait for a fixed
batch sleep before filling an observed free slot.

Under `--single`, this same queue applies to every scope size: launch one ticket,
wait for it to reach a terminal state and free the slot, then launch the next
eligible ticket. Do not reorder waves or explicit-set members.

1. `node tools/check-ticket.mjs --issue ORB-N`; a defective ticket is fixed in Linear
   BEFORE launch, not patched in the prompt.
2. Compose the worker prompt into a file OUTSIDE every repo (the session scratchpad; a
   file written inside the worktree gets committed by the worker) with
   `node tools/compose-prompt.mjs --issue ORB-N --output "<absolute path>"`. It carries
   the ticket body VERBATIM (it is the prompt, D2) and every chronological issue comment.
   Append the PER-TICKET finishing contract: run lint + type-check + tests for the touched
   workspace, commit, push, open a PR to `<target>` whose body links `ORB-N`, and attach the PR
   URL to the Linear issue (`orca linear attach`). When the ticket carries `visible-effect`,
   capture its surfaces, read every captured screenshot, and critique each one against
   `DESIGN.md` plus the root `RENDER-CORRECTNESS.md` before attaching evidence. Fix every
   finding and re-capture, stopping when the critique is clean or after at most three critique
   iterations because an unbounded subjective loop burns the worker budget. At the cap, stop
   revising and state every unresolved finding honestly in the critique. For `parity:yes`,
   cover web and mobile, or name the platform gap and its reason. Attach the final screenshots
   and the critique to the issue, then set the issue to In Review and own the automated review
   cycle until the worker reports approved with zero unresolved threads or sends one escalation.
   The branch is NOT the worker's job; step 3 hands it the contract branch already checked out.

   **Do NOT hand-write the STANDING clauses here.** Never ask a question, state a blocked
   criterion as UNMET instead of stalling, own only this PR's automated review, escalate on
   the three contract conditions, never arm a monitor that outlives the contract, never merge:
   all of that is `WORKER_CONTRACT` in `tools/launch-worker.mjs`, which APPENDS it to your
   prompt file at launch (idempotently). The guarantee is structural precisely because it
   used to be prose in this list: on the ORB-88 run a worker whose hand-composed prompt omitted
   the clauses ended a turn on a question and stalled until a human noticed the terminal, and
   then armed a monitor on another ticket's PR. `tools/test-tools.mjs` fails if a clause is
   dropped, so the Harness Execution job is what keeps it true, not this paragraph.
3. `node tools/launch-worker.mjs --issue ORB-N --prompt-file "<absolute path>"`
   (`--base-branch <target>` when the target is not `main`, `--branch-prefix fix` for a
   bug ticket, `--repo ui|api|landing` only to override the `repo:*` label, and
   `--max-parallel-worktrees 1` when the run has `--single`). It prints
   the terminal handle, worktree path and branch as JSON: keep that, it is what you
   babysit with. Exit 0 means the worker ACCEPTED the prompt as a user turn, read back off
   the TUI, not merely that orca accepted the send. Exit 1 means the concurrency cap was
   reached before anything was created, or the worker never reached tui-idle or took the
   pointer. Exit 2 is usage or config; exit 3 is an orca or git failure. A cap refusal
   creates nothing to roll back. After any later non-zero exit, the tool rolls its own
   worktree and branches back out, so relaunching after fixing the cause starts clean
   rather than piling up
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
  Claude Code paints "Is this a project you created or one you trust?", commonly reports
  `codex-trust-workspace`, and takes `1` + Enter; codex paints "Do you trust the contents
  of this directory?", normally reports `codex-interactive-prompt`, and takes **Enter alone**,
  because its list preselects option 1 and says so ("Press enter to continue"). Sending
  codex the digit was measured leaving its process exited (-1). Two matching subtleties:
  Orca 1.4.156 was also measured retaining `codex-trust-workspace` on an idle codex terminal
  that never saw a trust gate. WHY: PR #629 owner adjudication makes that live capture
  authoritative over the older one-reason-per-engine mapping.
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

It also resolves model routing from the selected engine's `models` map in
orchestrator.json. No tier label selects `default`; `tier:cheap` and `tier:deep` select
the corresponding engine-specific entries. A tier must change the resolved invocation.
Unknown or conflicting tier labels, missing mappings, and identical tier invocations
fail the launch loudly. The legacy `worker:sonnet` label is rejected with remediation to
use `tier:cheap`; it is never silently translated or ignored.

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
code). Its model map defaults to gpt-5.6-terra at medium reasoning, maps `tier:cheap` to
gpt-5.6-luna at low reasoning, and maps `tier:deep` to gpt-5.6-sol at high reasoning.
Terra-medium is the routine default because the 23 pull requests in the 2026-07-28
unattended run all used Sol-high and averaged 2.0 CHANGES_REQUESTED rounds, exactly the
result that had condemned Terra-medium. That measured falsifier reversed the earlier Sol
default. Model routing does not change the top-level `worker` selection; D5 keeps that as
an explicit configuration decision.

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
never a stale local ref, a clean worktree, the branch pushed, a PR open against the target,
the issue In Review with the PR attached, an approved review decision, zero unresolved threads,
and an image attached when the ticket is `visible-effect`, D7) and exits non-zero listing exactly
what is unmet. For a `visible-effect` ticket, also inspect the issue evidence and require the
attached critique paired with the final screenshots before treating the contract as met. That
list plus this critique check is what you nudge with. Nothing else counts as "done".

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

After the PR opens, the worker owns its automated review cycle. The orchestrator does not read
review bodies, author review-round files, or relay findings back to the worker. It waits for one
worker report:

- **Done:** the current head is approved with zero unresolved threads.
- **Escalated:** the worker disagrees with a finding, is blocked on a decision it may not make,
  or has failed the same finding in two consecutive cycles. Only then may the orchestrator read
  that finding's review body and the worker's reasoning, reconcile it against the diff (D8), and
  adjudicate it. Do not load unrelated review bodies.

The worker may use `pr-watch.mjs` only as a low-level review and check transition wake-up. After
every call and before waiting or reporting Done, it runs `worker-status.mjs --json` as the
full-surface completion poll. That poll inventories review submissions, review threads and their
nested comments, and PR conversation comments, and fails closed on an incomplete inventory.

An informational automated finding that needs no code change is handled by the worker replying
`No code change required: <reason>. Evidence: <PR commit>`, naming a commit on the PR that
changed the reviewed path, and resolving it. It is neither a disagreement nor an escalation.

The worker's two failed cycles on one review finding trigger escalation, not D9. D9 still counts
failed ticket-body implementation cycles and is unchanged.

Once the worker reports Done, run exactly ONE pre-merge verification for that ticket:

```
node tools/worker-status.mjs --worktree <worktreePath> --issue ORB-N [--base <target>] --verify-review
```

This is one pass for the whole ticket, never one pass per review round. It verifies the final
diff and thread metadata without printing review bodies. A resolved automated thread whose
named fix commit did not follow the reviewed commit or change the reviewed path, a human-authored
thread resolved by the worker account, a head without its own approving review, or any unresolved
thread is a hard failure. Stop for human adjudication on failure; do not run a second verification
pass.
- D7: an issue may sit In Review only with its PR attached. When labelled `visible-effect`,
  it also needs final screenshots and the worker's critique attached; otherwise demote to In
  Progress and finish.
- D9 two strikes: a second failed ticket-body implementation cycle sets the `attempts:2`
  label and the ticket is
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
- "All PRs green" requires reviewDecision APPROVED, zero unresolved threads, and a passing
  one-time pre-merge verification, not just checks passing.

## 4. Advance

**Project scope, the default.** Thomas merges, and the run never asks him to merge a ticket
until its one pre-merge verification has passed. On his word (or on observing merges), fetch,
verify the Linear issue is Done, then immediately run
`node tools/teardown-worktree.mjs --issue ORB-N` for that ticket. It is evidence-gated:
if it refuses, leave the tree untouched, record the failed check, and do not call the
ticket cleaned up. On confirmed removal, record the removed worktree path in that
ticket's ledger row. Then re-run wave-plan and launch the newly launchable set. Repeat
until the project has no unfinished tickets, then print the final ledger: ticket, PR,
merge SHA, evidence link, removed worktree. This holds whether the run was invoked with
a project name or with a single `ORB-N`, because without `--only` a ticket argument
names where to start, not where to stop.

**`--only` ends here instead.** The run is complete once that one ticket's worker reports
approved with zero unresolved threads, its one pre-merge verification passes, and its issue is
In Review with the PR attached, plus the final screenshots and critique when it carries
`visible-effect`. Print that ticket's ledger row and STOP. A merge of that ticket is not a
trigger to launch anything: observing it may have opened a wave, but the run was explicitly
bounded. Name the tickets that became launchable so Thomas can start them, and do not start them.

**Explicit-set scope also ends here.** It never advances a wave, including when a
member merge makes a successor launchable. Finish after every launchable member has
an approved PR with zero unresolved threads, its one pre-merge verification passed,
and its issue is In Review with the PR attached (plus D7 evidence when required), and
every refused member has its blocker or strike reason recorded. Print one ledger covering
every requested member, then re-read the full DAG, name the tickets that became launchable,
and STOP without starting them.

## 4a. `--sleep`: no questions, and the run merges its own PRs

`--sleep` means Thomas is asleep. It suspends exactly one thing, the human merge of
D3, and nothing else. Every gate stays where it is; the flag removes the reviewer
from the loop, never the review.

**This is a deliberate, Thomas-authorised exception to D3** ("a human merge is the
only thing that advances a wave"), and to the `Never: merge a PR` line below. Say so
in the run's opening line, so a reader of the transcript is never left wondering
whether the run went rogue.

For each candidate PR, read `mergeStateStatus` and `headRefOid` first. If it is
`BEHIND`, run `gh pr update-branch <n> --repo <owner/repo>` and wait for GitHub to
expose the resulting head SHA. Only then enforce the conditions the merge tool
cannot decide for one PR, all against that recorded head:

1. `--sleep` was passed, every wave blocker is merged, and Phase 1's gates are green
   on the target branch.
2. Every status check has concluded. The tool rejects failed conclusions and keeps
   every pending check from being merged past, including non-required checks. This
   is intentionally stricter than GitHub's mergeability state.
3. `mergeStateStatus` is `CLEAN` and `headRefOid` still matches the recorded head.
4. The D7 evidence gate is satisfied: the PR is attached to the issue, and a
   `visible-effect` ticket has its final screenshots and critique attached, with
   the critique's final result recorded as `clean`. A critique that ends with
   `unresolved findings` at the iteration cap stops that ticket for human review.
   The cap permits an honest handoff; it never permits an unattended merge.
   The merge decision reads the Linear issue state as its own fresh, last evidence
   input immediately before deciding. Never reuse a state read from preflight,
   verification, or an earlier part of the run. `In Review` passes without a write.
   A regressed `In Progress` state records the decision-time instant, then only after GitHub
   confirms the merge is re-set to `In Review`, printing
   `LINEAR-STATE-REASSERTED issue=ORB-N observed=In Progress at=<ISO-8601 instant>`.
   A failed lookup, an unknown state, or any state other than `In Review` or
   `In Progress` refuses the decision rather than assuming the evidence passed.
5. The ticket carries no `attempts:2` label (D9 refuses it regardless of colour).
6. **The ticket's one pre-merge verification passed.** The worker, not the orchestrator,
   handled review bodies and review rounds. Run `worker-status.mjs --verify-review` exactly
   once after the worker reports approved with zero unresolved threads. A resolved automated
   thread whose named fix commit did not change the reviewed path, a human-authored thread
   resolved by the worker account, or any unresolved thread is a hard failure. Stop that ticket
   rather than reading review bodies or repeating the pass.

Immediately before the one verification pass, read `headRefOid` and `mergeStateStatus`. If the
state is `BEHIND`, update the branch and wait for the new head before starting the pass. Verify
only a `CLEAN` recorded head. If the head moves after verification, stop that ticket for human
review rather than running a second pass.

Record the verified `headRefOid` as the expected head. Retain a metadata-only review activity
snapshot: item identifiers plus every review `submittedAt` and non-null `updatedAt` and
`lastEditedAt`, every inline-comment creation and edit, and every conversation-comment creation
and edit. Select only identifiers and timestamps before command output reaches the orchestrator;
review bodies remain unread unless the worker escalated one. Find the latest timestamp. GitHub
timestamps have second precision and the sweep treats activity equal to the cutoff as new, so
wait for the next second when necessary, then capture a current UTC ISO-8601 instant strictly
later than the latest activity as `reviewed-through`.

Immediately re-read the same metadata-only sources and unresolved-thread count. The snapshot
must be unchanged, no activity may be at or after `reviewed-through`, and the unresolved count
must be zero. New activity stops the ticket for human review; it does not start another
verification pass. Do not filter by author.

Invoke the strict sweep immediately after those reads pass, for ONE PR at a time from the
repository root. The required order is: one diff-and-thread verification, boundary, metadata
validation reads, sweep. Do not post, edit, resolve, or otherwise mutate review activity between
capturing the timestamp and invoking the sweep.

```bash
bash tools/merge-sweep.sh \
  --expected-head <pr-number>=<expected-head-sha> \
  --reviewed-through <pr-number>=<ISO-8601-timestamp> \
  --issue <pr-number>=ORB-N \
  <owner/repo> <pr-number>
```

One PR at a time is load-bearing, not a style choice. Serialising each preflight and
sweep keeps this run's own merges from advancing the base under a sibling PR.
Re-batching PR numbers would reopen the stale-head window whenever an earlier PR
merged. It does not control independent merge actors:
`.github/workflows/dependabot-auto-merge.yml` can advance the base through a
repository-level auto-merge.

That independent actor can advance the base between the final `CLEAN` read and the
script's own `gh pr update-branch`. Passing the expected head closes that race: the
script re-reads the head after updating and during every poll, skips with both SHAs if
it changed, and supplies `--match-head-commit` to GitHub at the merge call so the
server refuses a last-moment change.

The script owns the remaining mechanical merge decision. It repeats the branch update
as a safety check, polls `mergeStateStatus`, rejects failed checks, requires
`reviewDecision=APPROVED`, waits for the `review` check on the current head SHA to
settle, and re-reads the decision after updates. Its review-safety query is the last
API read before the merge call: it requires every review thread to be resolved and no
review submission or edit, inline review comment or edit, or conversation comment or
edit at or after `reviewed-through`. It paginates review submissions through GraphQL
and checks `submittedAt`, `updatedAt`, and `lastEditedAt`, checks both creation and edit times
for comments, admits no author exclusions, and fails closed on every thread or activity
lookup.

There is still an unavoidable final API race between the response to that safety query
and the merge request. The sweep makes the safety query last, but it cannot prevent new
activity from arriving after that response. It squash-merges without `--admin`, then
rechecks review activity after every successful merge. New activity, unresolved
threads, or an unverifiable review lookup found by that recheck were detected and
reported, not prevented: the script prints the corresponding
`POST-MERGE-ACTIVITY`, `POST-MERGE-UNRESOLVED-THREADS`, or
`POST-MERGE-REVIEW-LOOKUP-FAILED` marker, exits `4`, and the run stops all further
unattended merges and copies that result into the closing report. It also checks that
a merged head did not move afterwards. Its workflow lookup fails closed: if it cannot
prove the repository has no review workflow, the current-head review wait stays
enabled.

`--sleep` always invokes `tools/merge-sweep.sh`. It never invokes
`tools/merge-sweep-cov.sh`: that variant can use `--admin` to override a SonarCloud
new-code-coverage failure, while an unattended run must never bypass a red check. A
PR blocked only by new-code coverage is stopped for human review and listed in the
closing report. The coverage variant is an attended choice outside `--sleep`, made
only by a human deliberately invoking:

```bash
bash tools/merge-sweep-cov.sh \
  --issue <pr-number>=ORB-N \
  --reviewed-through <pr-number>=<ISO-8601-timestamp> \
  <owner/repo> <pr-number>
```

Read the script's per-PR output, not only its process exit code. `MERGED #<n>` is the
merge result. `SKIP #<n> UNRESOLVED-THREADS=<count>`,
`SKIP #<n> NEW-REVIEW-SINCE ...`, including the endpoint-specific inline-comment
form, either named review-lookup failure, any other `SKIP`, or `MERGE-REFUSED`
leaves that PR open and supplies its stopped reason.
Exit `0` also covers a completed sweep that skipped a PR. Exit `1` reports an
orphaned merged head, exit `2` bad usage, exit `3` an unverifiable merged head, and
exit `4` post-merge review activity or an unverifiable post-merge review state. Exit
`4` is not proof that the merge was unsafe, but the result missed or could not verify
the pre-merge decision boundary: stop further unattended merges and report the exact
`POST-MERGE-*` line, including its activity, count, or lookup source detail. For exits
`1` or `3`, re-read the affected PR state and record it as a harness defect rather
than claiming the PR remained unmerged.

After the script returns, read the PR's `headRefOid` and merge commit. For a `MERGED`
result, the merged `headRefOid` must equal the expected head that passed conditions 1
to 6. If it differs, say loudly in the closing report that the PR merged on an
ungated head, include both head SHAs and the merge commit, and stop all further merges
in that repository until Thomas has looked. A PR named by any `POST-MERGE-*` marker is
already merged: keep it in the Merged section, copy the exact marker and its activity,
count, or lookup source detail into that entry, and stop all further unattended merges.

On anything the skill-only gates or the strict script cannot decide, do NOT guess and
do NOT pick a middle path. Stop that ticket, leave its PR open, record the reason, and
carry on with the others. A single stuck ticket must never stall the rest of the wave.

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

Never: push to main, merge with `--admin`, merge a PR that fails a skill-only gate
or the strict sweep, or let a worker run before Phase 1's gates are green on its
target branch. Merging a PR is forbidden too, EXCEPT under `--sleep` on the terms in 4a.
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
   defect that run found, each with its evidence and its workaround. Its title must contain
   the fixed marker `Harness defect ledger`, which lets `check-ticket.mjs` distinguish its
   children from ordinary child tickets. One ticket per RUN, never one per defect; it must
   pass `node tools/check-ticket.mjs --issue ORB-N` like any other ticket. An empty ledger
   creates nothing: silence is correct when nothing broke.
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

1. **The run ticket stays the durable record of every ledger entry; only recurring or blocking
   defects get a CHILD ticket to be fixed from.** Create a child
   (`orca linear create --parent <run ticket>`) when the defect occurred on at least three
   tickets or blocked the run. Record every entry below that threshold in the parent ticket's
   body with its evidence. If later evidence raises a recorded entry to three occurrences or
   shows that it blocked a run, create its child then from the accumulated evidence.
   Each child describes ONE defect, passes `check-ticket.mjs`, and contains this fixed line:
   `Ledger occurrence: <count>; blocked: no|<what it blocked>`. Use `no` only for a
   non-blocking defect; a blocking value must affirmatively name the outcome using
   exactly `blocked the <operation>` or `the <operation> was blocked`, with no negative
   qualifier. Put supporting evidence elsewhere in the child body. The aggregate ticket above
   cannot carry N repair PRs: it would close on the first merge, leaving the rest with no live
   issue to launch from, attach to or close, and `launch-worker.mjs` derives the worktree name
   and branch from the issue, so two PRs off one issue collide before that even matters.
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
