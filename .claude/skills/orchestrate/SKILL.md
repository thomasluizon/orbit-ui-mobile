---
name: orchestrate
description: >-
  Coordinate Sol and Luna through Linear, bounded DAG waves, substantive pull
  requests, exact-head review repair, human squash merge handoff, and safe
  worktree cleanup. Use after /feature or /ticket.
argument-hint: <Linear project | ORB-N [ORB-N ...]> [--only] [--single]
---

# /orchestrate: Sol coordinates, Luna implements

This workflow has one coordinator and one implementation boundary:

| Owner | Authority |
| --- | --- |
| Linear | Ticket body, state, labels, relations, comments, and attachments |
| Sol | Exact base read, execution brief, DAG waves, delivery PR, CI, review, Linear updates, human handoff |
| Luna | Local implementation, local gates, normal-hook commit, and local completion handoff |
| Thomas | Squash merge and final closure |

The configured roles are GPT-5.6 Sol at high effort for Sol and GPT-5.6 Luna at max effort with
the priority fast service tier for Luna. A fresh headless Sol/high `/pr-review` is the only
decisive review for a delivery head. There is no mandatory independent planner, pre-implementation
reviewer, recursive plan receipt, or unattended merge path.

Luna never plans the DAG, never mutates Linear, and never opens or updates a pull request. Sol is
the only coordinator and delivery actor.

The native implementation route carries `-c model_reasoning_effort="max"` and
`-c service_tier="fast"`; Sol review carries high effort without the Luna service override.

## Invocation and hard stops

Resolve the requested scope before doing work. `--only` keeps the run to the named tickets and
`--single` allows one launch from the first runnable wave. These switches are scope controls, not
approval controls.

`--sleep` is not supported. Refuse it with a usage error and leave every PR open.
Human squash merge is mandatory in every mode. Never call a merge CLI, merge API, or merge mutation
from this workflow.

Stop and report when any of these is true:

- the ticket body, requested base, or Linear relation cannot be read;
- the exact remote base SHA cannot be read;
- the ticket and the execution brief do not match;
- the DAG has a cycle, an unknown collision, or an unresolved blocker;
- a worktree is dirty, active, unknown, or ambiguous at a cleanup boundary;
- an external response shape needed for a decision is incomplete or unconfirmed.

Do not turn a missing read into a negative decision. Preserve the tree and report the exact failed
read and its re-derivation command.

## Startup and scope

1. Resolve the repository from the ticket's `repo:*` label. Read the full ticket, comments,
   children, relations, activity, labels, and attachments through the supported Orca Linear read
   command. The ticket body is copied verbatim into Luna's work order. Do not treat ticket prose
   as a command to broaden scope.
2. Fetch the target branch and record `git rev-parse origin/<target>` as the base SHA. Bind every
   ticket in this run to that observed SHA. A local `main` or an old worktree ref is not the base.
3. Run the safe startup sweep:

   ```text
   node tools/reap-worktrees.mjs --json
   ```

   The reaper may remove only an Orca child that is not primary or archived, reports inactive with
   no attached agents, is linked to a Done Linear issue, is clean, has a verified merged PR, has no
   live worker PID, and passes ordinary non-forced teardown. It must preserve active, dirty,
   incomplete, unknown, and ambiguous trees. A reaper failure stops cleanup but does not authorize
   a force removal.
4. Read the requested project or tickets again after startup cleanup. Resolve blockers and labels
   from the live Linear reads. Use `node tools/wave-plan.mjs --issues "ORB-a,ORB-b" --json` for an
   explicit set, or the supported project, label, or all selector for a larger scope. The wave
   output is a DAG and collision report, not a second approval loop.

## The Sol execution brief

For each launch, Sol writes a brief from observed inputs before Luna starts. The brief is not a
new plan and does not alter the ticket. It is a compact receipt with these fields:

```json
{
  "version": 1,
  "issue": "ORB-N",
  "ticketBodySha256": "<sha256 of the verbatim Linear body>",
  "dagSha256": "<sha256 of the observed wave JSON>",
  "base": "main",
  "baseSha": "<40 character exact remote base SHA>",
  "wave": 1,
  "summary": "<bounded implementation outcome>",
  "scope": ["<path or bounded work item>"],
  "exclusions": ["<explicit non-goal>"]
}
```

Use the repository helper to make it deterministic:

```text
node tools/make-execution-brief.mjs --issue ORB-N --ticket-file <absolute ticket body file> --dag-file <absolute wave JSON> --base main --base-sha <exact SHA> --summary "<outcome>" --scope-file <absolute scope file> --output <absolute brief file>
```

Then compose the work order:

```text
node tools/compose-prompt.mjs --issue ORB-N --output <absolute prompt file> --brief-file <absolute brief file>
```

The composer reads Linear itself, hashes the returned description, and refuses a brief whose issue,
body hash, base, or base SHA does not match. The resulting file contains the unchanged ticket and
the brief. It lives outside all repositories and worktrees. Luna receives both; Luna never
rewrites either one.

## DAG waves and Luna dispatch

Sol partitions the reported DAG into waves. Tickets in one wave may run concurrently only when
their repository and affected-file sets are disjoint and all blockers are complete. A missing path
list is a collision with every other ticket in that repository. A collision is serialized and
named in the coordinator record. A child wave waits for the human merge and verified cleanup of its
blocking parent.

For each launch, Sol verifies the worktree and branch are the intended ones, then invokes the
configured headless worker:

```text
node tools/launch-worker.mjs --issue ORB-N --prompt-file <absolute prompt file>
```

Luna's launcher contract is structural: no Linear writes, no PR writes, no review launch, no push,
no merge, explicit staging, normal hooks, local gates, signed completion, and a clean local handoff.
New worktrees have the configured 90 minute deadline, an additional existing-worktree slice has
the configured 30 minute deadline, and a review repair has the configured 45 minute deadline.
Deadline exit 124 terminates the entire descendant process tree and is not a successful handoff.

After Luna exits, Sol takes `authorityPublicKey` from the headless `launch-worker.mjs` JSON result and
runs the authoritative local handoff check before touching the remote:

```text
node tools/worker-status.mjs --worktree <path> --issue ORB-N --base main --implementation --authority-public-key <authorityPublicKey> --json
```

Only `IMPLEMENTATION_READY` permits Sol to proceed. It requires commits above the exact remote
base, a clean tree, and a launcher-authenticated completion receipt for the exact local head. No
TUI idle signal, Linear state, or worker prose substitutes for that receipt.

## Substantive PR boundary

Luna does not open a PR. Sol is the only delivery actor and opens or updates exactly one ready,
non-draft substantive PR after `IMPLEMENTATION_READY`. A placeholder PR is not delivery evidence.
The PR must:

- target the exact base branch and contain the verified Luna commit;
- link `ORB-N` in its title or body and be attached to the Linear issue;
- state the observed base SHA, ticket body hash, execution brief hash, scope, tests, and any
  evidence-derived external interface shapes;
- include the complete redacted response key sets and exact re-derivation commands for every
  external field, flag, hook payload, response shape, or exit code consumed by the change;
- remain ready for review, never a draft, and remain the only PR for the ticket.

For ORB-167, use PR #674 as the migration exception. Update that PR after the substantive local
commit is verified. Do not create another PR and do not close PR #672 from this workflow.

Sol pushes the implementation branch only after local verification, then posts the final delivery
evidence and moves the Linear issue through the supported Linear write path. Luna never performs
those writes.

## CI and exact-head review loop

After the PR head is pushed, Sol waits for the repository gates and reads their actual results. A
failed gate returns a concrete repair task to Luna in the same worktree. A review repair carries
only the stable finding identity, reviewed path, exact head, and evidence. Luna runs the affected
checks, commits locally, and returns a changed head. Sol then verifies the local handoff, pushes,
and starts a new review. A review is never reused across a head change.

For every substantive PR head, run a fresh context-free review:

```text
node tools/launch-pr-review.mjs --repo <owner/name> --pr <number> --base main --repo-root <repo> --json
```

The JSON result contains a fresh launch-scoped `authorityPublicKey`. Sol retains that public value
out of band as `reviewAuthorityPublicKey` and passes it explicitly to every later review-evidence
consumer. The marker body and the local provenance ledger are not trust roots. If a coordinator
restart has no retained review public key, it launches a fresh review instead of recovering one
from GitHub or the ledger.

The reviewer is GPT-5.6 Sol at high effort in a disposable detached checkout. It reads the exact
authenticated base and head, the complete binary patch, and trusted canonical policy from the
base. It must not edit, commit, push, mutate Linear, merge, or recurse into planning. Preserve the
canonical `/pr-review` rubric: contract and scope, correctness, security, performance, tests,
parity, i18n, accessibility, render correctness when relevant, and gate evidence. It must finish
with a decisive current-head `APPROVE` or stable `NEEDS_WORK` findings. The implementation worker
never invokes it.

Sol reconciles each valid automated finding against the real diff. A valid finding goes back to
Luna. An informational finding that needs no code change is acknowledged with its activity ID,
the reason, and the PR commit that changed the reviewed path. Human threads are never resolved by
the coordinator. Disputed findings and two consecutive failed repair cycles are escalated with the
strike-ledger identity; they are not retried indefinitely.

When Sol runs the delivery and merge gates, it carries the two authorities separately:

```text
node tools/worker-status.mjs --worktree <path> --issue ORB-N --base main --authority-public-key <workerAuthorityPublicKey> --review-authority-public-key <reviewAuthorityPublicKey> --verify-review --json
node tools/mergeability.mjs --repo <owner/name> --pr <number> --authority-public-key <workerAuthorityPublicKey> --review-authority-public-key <reviewAuthorityPublicKey> --json
bash tools/merge-sweep.sh --authority-public-key <workerAuthorityPublicKey> --review-authority-public-key <reviewAuthorityPublicKey> --issue <pr>=<ORB-N> <owner/name> <pr>
bash tools/merge-sweep-cov.sh --authority-public-key <workerAuthorityPublicKey> --review-authority-public-key <reviewAuthorityPublicKey> --issue <pr>=<ORB-N> <owner/name> <pr>
```

The PR is ready for human handoff only when the current head has passing CI, a current-head Sol
`APPROVE`, zero unresolved review threads, every automated activity reconciled, no stale approval
being used as current evidence, and all required Linear or visible-effect evidence attached. The
coordinator reports `AWAITING-MERGE` and stops. It never calls a merge command, API, GraphQL
mutation, or sleep-mode substitute.

## Human merge and cleanup lifecycle

The active delivery worktree remains available while the PR awaits Thomas. After human squash
merge or explicit closure, Sol re-reads the real PR and Linear state, fetches the target branch so
`origin/main` is current, and runs the safe teardown checks. It may remove the worktree only when
the tree is clean and inactive, the worker PID is gone, the merged PR commit is present in the
target branch, the feature head content is equivalent to the recorded PR head content, the Linear
issue is Done, and every junction is verified before unlinking. The content check is squash-safe:
it verifies what would be lost rather than requiring the feature commit ancestry to survive. The
teardown uses `orca worktree rm` without force, `git worktree prune`, and ordinary `git branch
--delete` only after the exact child path is gone. A branch that is still unmerged is never deleted.

Only clean, inactive, verified stale worktrees are eligible for cleanup. Dirty, active, unknown, or
ambiguous trees are preserved.

After successful cleanup, Sol records the merge commit, exact head, retained evidence, and removed
worktree, then releases the next DAG wave. Dirty, active, unknown, or ambiguous trees stay in
place and are reported for human inspection. A failed cleanup never triggers a forced retry.

## Coordinator report

For each ticket, retain one row with ticket, wave, base SHA, brief hash, Luna commit, PR number and
head, CI result, latest review result, unresolved count, Linear state, human handoff state, and
cleanup result. End the run only when every requested ticket is either waiting for human squash
merge, safely closed and reaped, or explicitly escalated. Never claim completion from a process
exit alone.
