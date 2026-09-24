# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, and its last section, "What the 2026-09-24
evening sleep run added (session `382214fc`)", before anything else.

## Entry point

`/sleep`. It enters `/orchestrate` itself. Codex (`gpt-6-sol`) writes code through
`node tools/launch-worker.mjs`.

## The goal: finish the spec

The goal is an empty board and a production release, exactly as the spec defines it. Re-derive what
is left rather than trusting this file:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

A blocker is the next piece of work, and before any blocker reaches Thomas, every installed tool and
existing account that could reach the same goal is tried and written down. Only an exhausted
allowance, the machine stopping, or Thomas saying stop ends the run. Never ask him anything during
the run: take the recommended option and log it.

## What to do, in order

1. **Promote the approved lesson.** Ticket and PR adding one line to `.claude/rules/core.md` rule 8:
   "Before any item reaches Thomas as a blocker, try every installed tool and existing account that
   could reach the same goal, and write what each returned. A blocker names the goal, not the first
   method's precondition." Run both harnesses.
2. **Merge the four approved PRs** once green, back to back, each at its exact approved head:
   `ui#1044`, `ui#1056`, `ui#1058`, `ui#1054`. `ui#1058` cancels superseded Guards runs, which the
   CI queue needs most.
3. **Read the `ticket-612-round4` worktree first.** A worker was mid-round on `ui#1029` at handoff
   (log below). Commit-and-push what it finished, or relaunch, then resolve its two threads and
   re-review.
4. Drive `ui#1052`, `ui#1030`, `ui#1055` (re-reviews owed) and `ui#1049` (two new findings) to merge.
5. **`ui#1057` (`#557` backport to `main`)**: clear its first review, merge with
   `--match-head-commit`, then `/android-release` to the open track and tell Thomas both times.
6. After `ui#1052` merges, **`#556`**: one PR that merges `main` (12 commits) into `redesign/main`.
7. Batch 0b rest (`#575` through `codex exec --output-schema`, `#642`), then batch 0c (`#574`,
   `#500`, `#495`, `#493`, `#499`, `#501`), then batch 1.
8. When Pullfrog publishes 0.1.83 (`npm view pullfrog version`), re-review the three pin PRs and
   confirm the log prints `openai/gpt-6-sol` and `effort: medium`.

## In flight, each with a disposition

| item | state | disposition |
|---|---|---|
| worker `#612` round (`ui#1029`) | running at handoff, worktree `ticket-612-round4` dirty 12 files, 3 unpushed commits, log `/var/folders/x_/m8324t4j1wv_m7y0r8839js00000gn/T/orbit-workers/#612-1790281971196.log`, outcome unknown | step 3 |
| `ui#1044`, `#1056`, `#1058`, `#1054` | APPROVED, CI pending | step 2 |
| `ui#1052`, `#1030`, `#1055` | fixes pushed, re-review owed | step 4 |
| `ui#1049` | CHANGES_REQUESTED, 2 findings, fixer cap spent last run | step 4 |
| `ui#1057` | first review owed | step 5 |
| pin PRs `ui#1046`, `api#537`, `landing#80` | blocked on Pullfrog 0.1.83 | step 8 |
| dependabot `ui#1034`, `#801`, `#799`, `#798`; `api#535`, `#538`, `#530` | rebased onto `main` | merge each approved and green |
| `api#528`, `#531`, `#532`, `#533` | older rounds owed | batches 1, 2a, 6 |
| worktrees of merged PRs: `ticket-541-progress-marker`, `ticket-633-menu-drill`, `ticket-634-handoff-sleep` | PRs merged | `node tools/teardown-worktree.mjs` each |
| scratch worktree `menu-probe` (old session, detached `959381da`, 4 debug-only edits) | debug instrumentation, diff saved in session `382214fc` scratchpad | leave; the guardrail refuses `--force` |
| `main` required checks | `Suppressions Ratchet` restored | swap to `Lint Severity` at the redesign merge (spec, THE REDESIGN GATE) |
| stashes, unpushed commits, dirty trees in all three repos | checked: none except the `#612` worker above | none |
| decision log `sleep-decisions.md` | session `382214fc` scratchpad | durable content copied into the spec section |

Every identifier here came from a previous session. Treat each as a lead to verify.

## --sleep

This file is written for an unattended run. Start with `/sleep`, write the run state under the new
session id, keep the Mac awake with `caffeinate -i -w <claude pid>`, and work the order above
without waiting for anyone.
