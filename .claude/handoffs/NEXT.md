# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, including its standing instructions and its last section,
"What the 2026-09-26 overnight sleep run added (session `4f2a4bf8`)".

## Entry point

`/sleep`. It is the only entry point; it runs `/orchestrate` itself. Thomas is asleep: take every decision
yourself, the best approach, and log it.

## The goal: finish the spec

An empty board and a production release, exactly as the spec defines it. The run ends only when the spec is
done, or externally (allowance exhausted, machine stopped, Thomas says stop). A blocker is the next piece of
work. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

169 tickets were open at this handoff.

## In flight, each with a disposition

Launch Codex workers about 90 seconds apart. Admission refuses new ticket work above 10 open PRs across the
three repos (9 open at handoff). **Until `ui#1123` merges, a Pullfrog approval counts only if it was submitted
after the head's push time** (`gh api "repos/<owner>/<repo>/activity?ref=refs/heads/<branch>"`, the entry whose
`after` is the head); `reviewDecision` APPROVED alone can be a re-pointed old review.

| item | state at handoff | disposition |
|---|---|---|
| `ui#1123` (`#697` review freshness) | round 2 committed `c31f89b4`, UNPUSHED; my revert of the worker's `bounded-process.mjs` edit is in it; harness NOT rerun after the revert | run `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`, put the evidence from the worker's `/tmp/ticket-697-pr-evidence.md` in the body (replace the check-suite block), resolve thread `PRRT_kwDOR5Siws6mODIH` after re-reading its id with `list-bot-threads.mjs`, push. File the `bounded-process.mjs` flake as its own ticket. Then the `main` backport of `list-bot-threads.mjs` |
| `ui#1126` (`#705` React out of shared) | approved at `977d8de8`; fix batch worker EXITED just after the handoff, result unread (log path in `.git/orbit-worker-launches`, worktree `orca/workspaces/orbit-ui-mobile/ticket-705-shared-react-hooks`), 10 unpushed commits incl. `90628b6c` | read the worktree: finish or salvage the batch (logic into shared cores, app hooks wiring only, manifest regenerated), then body, push, fresh review. SonarCloud was 39.8% duplication |
| `api#569` (`#704` explicit culture) | approved at `2d16f4a2`; batch 2 committed `692cc740` (architecture) and `ba4d30f0` (coverage tests), UNPUSHED | merge the worker report into the body, push, confirm SonarCloud new coverage >= 80% and `drift` green, merge to `main` |
| `api#574` (`#665` slip at write time) | CHANGES_REQUESTED: "A rolling deployment can permanently record slips as completions; the migration and writer transition need coordination" | review batch on the migration and writer transition (expand-contract), then merge to `main` |
| `api#571` (`#706` record pages) | batch 1 pushed `36a8900f`; waiter finished at handoff, result unread | read CI and review; merge to `orbit-api` `redesign/main`; then relaunch `#681` on `feature/ticket-681-astra-read-blocks` (clean) |
| `api#573` (`#607` accent Pro gate) | APPROVED at `1abc6da8` | verify push time, CI, merge to `orbit-api` `redesign/main` |
| `ui#1111` (`#675` Turnstile redesign port) | merge push `a0e2486e`; a same-head re-review was requested; `reviewDecision` APPROVED may be re-pointed | verify the approval postdates the push, then squash-merge to `redesign/main`. Then a `main` sync ticket for `1b5a32b3`, `314d5574`, `773c0a44` and later `main` commits |
| `ui#1125` (`#653` account day gates) | batch pushed `e3744af0`; APPROVED shown | verify freshness and CI, test the merge result, merge to `redesign/main` |
| `ui#1127` (`#622` step-up account reset) | APPROVED at `d58eadcd` | verify freshness and CI, test the merge result, merge to `redesign/main` |
| `#702` redesign port | `main` half merged (`ui#1124`); App not created | open the `redesign/main` port PR; the App is Thomas's manual step (spec) |
| 47 NEEDS_CONVERSATION board tickets | filtered at `/questions`: none is Thomas's | post each decision on its ticket and add `needs:no-conversation` before its worker (spec, overnight section) |
| running workers | `#705` fix batch (above) | as above |
| stashes, uncommitted work in the three main checkouts | 0 stashes; main checkouts clean | none |
| run record | `.git/orbit-orchestrate-run.json`, session `4f2a4bf8`, `sleep: true`, 22 merged rows | a new session writes its own; carry the open rows |

## What to do, in order

1. Land what is ready: `api#573`, `ui#1127`, `ui#1125`, `ui#1111` (each after the freshness and merge-result checks).
2. Push the three unpushed batches: `ui#1123`, `api#569`, `ui#1126` (after its worker's result is read).
3. Clear `api#574` and `api#571`; then relaunch `#681`.
4. Then follow the spec's `## The order: the batches to a production release`, batch by batch, never the
   board's leverage ranking. It was rebuilt on 2026-09-26 with all 169 open tickets, each in exactly one batch:
   Batch 0b (20 harness tickets), then Batch 0c (18 live defects on `main`, `#330` Android push first), then
   Batch 1 (19 redesign tickets, including the open PRs above) until `node tools/redesign-coverage.mjs` passes and
   every screen ticket is closed, then STOP at THE REDESIGN GATE (internal Play build for Thomas; never merge
   `redesign/main` to `main`). `plan-queue.mjs` is only for dependency order and deferrals inside a batch. Place
   every ticket you file into one batch in the same session.

Every identifier here came from a previous session. Treat each as a lead to verify.
