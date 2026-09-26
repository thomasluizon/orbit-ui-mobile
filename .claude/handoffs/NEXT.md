# NEXT

Read `.claude/specs/orbit-prod-release.md` before acting. Enter through `/sleep`.

## Goal

Finish the production release with an empty ticket board and the whole-redesign approval described by the spec. Check the live board with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## Order

Use the spec's `## The order` batches. Complete Batch 0b's timeless-text cleanup tickets first, then resume the remaining harness and redesign work. Reconcile every open ticket with exactly one batch before dispatching.

## In flight

Read the spec's `## Current state`, then refresh pull requests, tickets, worktrees, branches, stashes and running workers. Every item needs a disposition. Treat every identifier in this prompt as a lead to verify.

## Decisions

Keep a timed decision log in the session scratchpad outside the repository. Track decisions that require the owner under `## Current state` in the spec without quotes, dates or attribution.
