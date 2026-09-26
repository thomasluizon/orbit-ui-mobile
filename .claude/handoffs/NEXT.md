# NEXT

Read `.claude/specs/orbit-prod-release.md` before acting. Enter through `/sleep`; it runs `/orchestrate` itself. Nobody is awake to answer: take every decision with the best approach and log it in the session scratchpad.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 149 open tickets, all 149 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## Priority: Supabase egress

The Supabase project hit its monthly egress quota. Find and fix every egress waste in the app and the API before other new work: N+1 patterns where the API makes a thousand calls instead of one bulk call, over-fetching (selecting or returning far more rows or columns than needed), unbounded list queries, polling, and anything else that moves more data than the product needs. The owner will upgrade the Supabase plan, but the app must be optimized first. Measure egress per query shape (`pg_stat_statements` through the Supabase connector, or the performance-measurement tooling), rank by bytes, and fix the biggest first with before and after evidence. The spec's `### Batch E: Supabase egress, first` holds the procedure.

## In flight (verify each first; every identifier here is a lead)

| item | disposition |
|---|---|
| `orbit-api` PR 587 (`#739`) | approved and green at `153782e8`: merge it first; it unblocks PR 1160 |
| `orbit-ui-mobile` PR 1161 (`#30`, closes `#567`) | approved and green at `cd1cd739`, behind `main`: replace its owner copy-review section with a `/second-opinion` approval, test the merge result, merge |
| `orbit-ui-mobile` PR 1160 (`#178`) | review fix pushed; merge after PR 587 is merged and deployed |
| `orbit-api` PR 586 (`#225`) | review fix never launched (branch launch cap): relaunch with `--relaunch-reason`, order on the ticket; merge after a clean review (owner authorized) |
| `orbit-ui-mobile` PR 1162 (`#535`) | review fix committed locally in its worktree, not pushed: merge its report into the body, resolve the thread, push |
| `orbit-ui-mobile` PR 1163 (`#736`) | review order posted and prompt composed, not launched: launch it |
| `orbit-ui-mobile` PRs 1164 (`#464`), 1165 (`#533`), 1166 (`#625`) | CI and first review pending: drive to merge |
| `orbit-api` PR 588 (`#738`, base `redesign/main`) | CI and first review pending: drive to merge; then resume `#24` Stage 3 |
| `#681` worker on `feature/ticket-681-astra-read-blocks` | was running with local commits and no pull request; outcome unknown. Read its worktree and log first |
| `#632` worktree on `fix/ticket-632-deep-link-date-gate` | launch refused by admission; prompt ready: launch when admission allows |
| No stashes, no uncommitted work in the three primary checkouts; landing has no open pull requests | nothing to do |

## Then, in order

1. Run `/android-release` to the open track for the fixes merged on `main` (owner approved): standalone push, cold-start account settings, the chat keyboard, chat message IDs, the offline reorder drop.
2. Batch E (egress), then the rest of the spec's `## The order`: Batch 0b, Batch 0c, Batch 1, then STOP at THE REDESIGN GATE (a closed Play internal build for the owner; never merge `redesign/main` to `main`).
3. Owner decisions already taken, recorded on the tickets: `#740` extends the relative reminder model; `#297` uses real-time push; ads are deleted everywhere (`#199`, `#200`, and `#741` as its duplicate); copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes, dates or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
