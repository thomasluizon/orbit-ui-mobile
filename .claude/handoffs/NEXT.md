# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, and its last section, "What the 2026-09-24
night sleep run added (session `67f75f39`)", before anything else.

## Entry point

`/sleep`. It enters `/orchestrate` itself. Codex (`gpt-6-sol`) writes code through
`node tools/launch-worker.mjs`.

## The goal: finish the spec

The goal is an empty board and a production release, exactly as the spec defines it. Re-derive what
is left rather than trusting this file:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

A blocker is the next piece of work. Before any blocker reaches Thomas, try every installed tool
and existing account that could reach the same goal, and write down what each returned. Only an
exhausted allowance, the machine stopping, or Thomas saying stop ends the run. Never ask him
anything during the run: take the recommended option and log it.

## Thomas's order for this run, in his words

"put on the handoff that the FIRST PRIORITY is to fix this CI congestion permanently, this cant
happen again." And: "handoff fixes the ci congestion, merge the prs and continue the work in sleep
mode."

Added after the handoff, about `#217`, `#318` and `#320`: "if these tickets needs conversation, at
the time of executing them, claude needs to stop and talk to me when executing, its not that deep".
A conversation ticket is ordinary work; only its execution stops to talk with him. An unattended run
skips it and leaves it for an attended session. Replace the spec's "Thomas's own three, which only he
can close" (batch 1) with that rule.

## What to do, in order

1. **Fix the CI congestion permanently. Nothing else starts first.** The evidence and five
   candidate fixes are in the spec, `### The CI congestion, measured`. The root cause includes the
   run itself: it opened about 35 PRs after it decided to stop opening new ones. So the fix must
   include a limit in code that refuses new ticket workers while the open set or the queue is too
   large, not only cheaper CI. Ship it through a ticket and PR, run both harnesses, and record the
   design as a brain ADR. Until it merges, open no new ticket work. Only review rounds,
   merge-forwards and merges run.
2. **Merge the PRs Thomas authorized at wrap-up**, each at its exact head with green checks, an
   approval at that head and 0 open threads: `ui#1068`, `ui#1074`, `ui#1075`, `ui#1076`, and
   `api#539` (merged forward to `07d667fb`, so it needs CI and a review first).
3. **Drain the approved set before any new front.**
   - Push the unpushed `ui#1078` fix (`e1033d6a`) first.
   - Get same-head re-reviews on `ui#1066`, `#1067`, `#1069` and `#1072`.
   - Merge `ui#1071`, `#1078` and `#1081`.
   - Merge `api#540` to `#544` one at a time. Merge each one forward just before its turn, and
     request a FULL re-review after every merge-forward on `main`.
4. **Finish `api#553` (`#657`, logout revokes the whole session family).** Its worker died when the
   last session restarted. Read worktree `ticket-657-logout-session-family` first. Then merge it
   and confirm the Render deploy. Then do `ui#1057`: merge-forward, full re-review, merge,
   `/android-release` to the open track. Tell Thomas both times.
5. **`ui#1052`**: resolve its conflict, get a re-review, merge. Then **`#556`**: merge `main` into
   `redesign/main`.
6. Fix rounds, then merges, for the rest of the table in the spec's last section. That covers
   `ui#1029` then `#1030`, `ui#1049`, the unreviewed `ui#1077` and `#1079` to `#1090`, and `api#545`,
   `#547` to `#552` and `#554`.
7. Then continue the spec's batch order (batch 0b rest, 0c, batch 1) only while the new limit
   allows it.
8. When Pullfrog publishes 0.1.83 (`npm view pullfrog version`; it was 0.1.82 on 2026-09-24),
   re-review the three pin PRs.

## In flight, each with a disposition

| item | state | disposition |
|---|---|---|
| CI queue | 206 queued (116 `ui`, 90 `api`), 18 running, 0 on `api` | step 1 |
| `ui#1068`, `#1074`, `#1075`, `#1076`, `api#539` | authorized, CI pending | step 2 |
| `ui#1078` | APPROVED at `a554abf1`; the en price wrap fix `e1033d6a` is committed in worktree `ticket-426-brl-plans-fixture` and NOT pushed (5 commits ahead, including a merge of `redesign/main`) | step 3 |
| `ui#1066`, `#1067`, `#1069`, `#1072` | approvals at older commits | step 3 |
| `ui#1071`, `#1081` | APPROVED at head | step 3 |
| `api#540` to `#544` | `pullfrog-approval` SUCCESS, BEHIND | step 3 |
| `api#553` worker (`#657`) | launcher died at the restart; worktree dirty (2 files) plus 1 unpushed commit `64b1a506`; PR head `f2b7c12b`; outcome unknown | step 4 |
| `ui#1057` | BEHIND `main`, no approval, waits on `api#553` deploy | step 4 |
| `ui#1052` | DIRTY conflict | step 5 |
| other open PRs (spec table) | see the spec | step 6 |
| pins `ui#1046`, `api#537`, `landing#80` | wait for Pullfrog 0.1.83 | step 8 |
| Supabase redirect allowlist, Turnstile, `#565` source maps | spec, "Items that need a person" | Turnstile: try every Cloudflare tool first; `#565`: file and build source-map upload |
| worktrees of merged PRs (`ui` `ticket-493-widget-account`, `ticket-499-fix`, `ticket-501-widget-tsx`, `ticket-527-calendar-tz-cache`, `ticket-574-list-renders`, `ticket-638-missing-config`, `ticket-644-blocker-rule`, `ticket-645-main-alerts`, `ticket-646-dependabot-merge`, `ticket-652-decode-uri`, `ticket-633-menu-drill`; `api` `ticket-513-mcp-habit-emoji`, `ticket-529-apikey-stepup`; `landing` `ticket-509-track-empty-mirror`) | PRs merged, trees clean | `node tools/teardown-worktree.mjs` each, after a clean-tree check; tear down the others as their PRs merge |
| worktree `ticket-565-today-non-array-map` | no commits (at `c8f6e1b7`) | keep for the `#565` source-map work, or tear down |
| scratch worktree `menu-probe` (detached, 4 debug edits, old session) | debug only | leave; the guardrail refuses `--force` |
| Dependabot alert `#47` on `orbit-ui-mobile` `main` (1 moderate), reported by the handoff push | not read yet | read it; fix through a ticket and a PR to `main` after step 1 |
| stashes | none in all three repos | none |
| other unpushed commits and dirty trees | none except `ticket-426` and `ticket-657` above | none |
| decision log `sleep-decisions.md` (D1 to D168) | session `67f75f39` scratchpad | durable content copied into the spec section |

Every identifier here came from a previous session. Treat each as a lead to verify.

## --sleep

This file is written for an unattended run. Start with `/sleep`, write the run state under the new
session id, keep the Mac awake with `caffeinate -i -w <claude pid>`, and work the order above
without waiting for anyone. The CI fix comes first, then the merges, then the work in sleep mode.
