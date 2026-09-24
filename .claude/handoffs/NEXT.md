# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, and its last section, "What the 2026-09-24
sleep run added (session `dd9211b6`)", before anything else.

## Entry point

`/sleep`. It enters `/orchestrate` itself. Codex (`gpt-6-sol`) writes code through
`node tools/launch-worker.mjs`.

## The goal: finish the spec

The goal is an empty board and a production release, exactly as the spec defines it. Re-derive what
is left rather than trusting this file:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

A blocker is the next piece of work. Only an exhausted allowance, the machine stopping, or Thomas
saying stop ends the run.

## What to do, in order

1. **`ui#1041` (`#633`, the dead three-dot menu and the drill) to `main`.** Pullfrog APPROVED at
   `89bb9be5`, every check green, but GitHub read `BLOCKED` at handoff, and `verify-delivery.mjs
   --wait-ci 1500` ended `CI_PENDING` after the handoff, so a required check on `main` never reported
   within 25 minutes. Find that check, get it to report, merge with `--match-head-commit`, **tell Thomas it merged**, then run
   `/android-release` to the **open** track and tell him when it is live. He asked for both messages.
2. Drive the three Pullfrog pin PRs to merge (`ui#1046`, `api#537`, `landing#80`, all against
   `main`). After the first review under the pin, confirm its log prints `openai/gpt-6-sol` and
   `effort: medium`.
3. Back-port the `#633` fixes to `redesign/main` as a separate PR: `habit-drill.tsx` needs the drill
   visibility fix, and the redesign menu needs the same state-rollback check.
4. Drive every open `redesign/main` PR in the spec's table to merge. Poll with `--no-request`. Merge
   approved ones back to back, then merge-forward the rest once.
5. Close `#558` as done by PR 970 (the worker proved it; nothing changed on its branch).
6. Then the batch order: rest of 0b (`#556`, `#598`, `#638`, `#639`, and the deferred `#544`, `#575`,
   `#619`, deciding their technical questions yourself), 0c, then batch 1.

## In flight, each with a disposition

| item | state | disposition |
|---|---|---|
| workers | none running | none |
| `ui#1041` | APPROVED, green, BLOCKED | step 1 |
| pin PRs `ui#1046`, `api#537`, `landing#80` | review owed | step 2 |
| `redesign/main` PRs 1029, 1030, 1033, 1039, 1040, 1042, 1044, 1045, 1047 to 1051 | see spec table | step 4 |
| `api#521` | round 7 pushed | re-review, then merge and deploy (Thomas's 2026-09-14 rule) |
| `api#528`, `#531`, `#532`, `#533` | rounds owed | spec batches 1, 2a, 6 |
| dependabot `ui#1034`, `#801`, `#799`, `#798`, `api#536`, `#535`, `#530`, `landing#73` to `#79` | untriaged | triage with step 4 |
| merged worktrees `ticket-546`, `ticket-613`, `ticket-627`, `ticket-634` | branches merged | `node tools/teardown-worktree.mjs` each |
| empty worktree `ticket-558-progress-branch` | no commits | remove with `#558` |
| scratch worktree `menu-probe` (old session scratchpad, detached `959381da`) | debug only | `git worktree remove --force` after `#633` ships |
| stashes, unpushed commits, dirty trees | checked in all three repos: none | none |
| decision log `sleep-decisions.md` | in session `dd9211b6` scratchpad | its durable content is in the spec section |

Every identifier here came from a previous session. Treat each as a lead to verify.

## --sleep

This file is written for an unattended run. Start with `/sleep`, write the run state under the new
session id, keep the Mac awake with `caffeinate -i -w <claude pid>`, and work the order above
without waiting for anyone.
