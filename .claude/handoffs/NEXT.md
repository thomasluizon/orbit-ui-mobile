# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, including its standing instructions and its last section,
"What the 2026-09-25 evening sleep run added (session `e6f854b8`)".

## Entry point

`/sleep`. It is the only entry point; it runs `/orchestrate` itself. Thomas is asleep: take every decision
yourself, the best approach, and log it. His latest instruction: "just fix everything and continue".

## The goal: finish the spec

An empty board and a production release, exactly as the spec defines it. The run ends only when the spec is
done, or externally (allowance exhausted, machine stopped, Thomas says stop). A blocker is the next piece of
work. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

184 tickets were open at this handoff.

## In flight, each with a disposition

| item | state at handoff | disposition |
|---|---|---|
| worker `#691` round 2 (`ui#1107`, main sync) | RUNNING, worktree `orca/workspaces/orbit-ui-mobile/ticket-691-main-sync`, 1 unpushed commit `d046a8d7`, log `.../orbit-workers/#691-1790368541521.log` | read the worktree and report; it moves the React checklist hook out of `packages/shared` (Build was red). Merge the report into the body, push, re-review. Land by **fast-forwarding `redesign/main` to the approved head** (spec), never squash |
| `api#563` (`#678` read cards) round 2 | worker DONE, commit `d923b83a` NOT pushed (overdue completions in the card series) | merge its report into the body (log `#678-1790368483994.log`), resolve `PRRT_kwDORKgXhc6mJTGQ`, push, wait, merge to api `redesign/main` |
| worker `#688` (redesign Google attempt port) | RUNNING, worktree `ticket-688-google-attempt-keep`, commit `b2093efc`, no upstream yet, log `#688-1790368925349.log` | verify-delivery, review, merge to `redesign/main` |
| worker `#666` (child completion hint) | RUNNING, worktree `ticket-666-child-completion-hint`, 2 dirty files, no commit, log `#666-1790368927923.log` | read the worktree first; verify-delivery, review, merge to `redesign/main` |
| `ui#1106` (`#675` Turnstile, main) | round 3 pushed at `253eea34`, review pending | merge to `main` when approved and green; then open the `redesign/main` port |
| `api#564` (`#679` stream steps) | round 1 pushed at `938a2336`, review pending | merge to api `redesign/main` when approved and green |
| `ui#1049` (`#559` spacing rule) | `24a5de87` pushed (header scale fix), review pending | merge to `redesign/main` when approved |
| `ui#1108` (`#694` shared no-React lint) | open against `main`, review pending | merge to `main` |
| `ui#1046`, `landing#80` (Pullfrog pins) | body-only fixes, same-head re-review requested | merge to `main` when approved; return all pins to `@v0` once `pullfrog` 0.1.83 is published |
| tickets next after `ui#1107` lands | `#692` (redesign admission, the next sync's resolution), `#693` (main Android checklist keys) | launch in that order |
| stashes | 0 in all three repositories | none |
| uncommitted work in the main checkouts | none | none |
| run record | `.git/orbit-orchestrate-run.json`, session `e6f854b8`, `sleep: true` | a new session writes its own; carry the open rows |

## What to do, in order

1. Deliver everything in flight above. Merge before opening: admission refuses new tickets above 10 open PRs.
2. Land `ui#1107` by fast-forward, then `#692` and `#693`.
3. The `#318` program: `#680` (after `api#563` merges), `#681`, then `#682` after `api#564` and `#24` Stage 3.
4. The `redesign/main` port of `#675` after `ui#1106` merges; then `#674`, `#620`, then the board by leverage
   (`plan-queue.mjs --board`).
5. In every UI worker order until `ui#1108` merges: "no file under `packages/shared` imports React, React Native
   or Next; put logic in a `*-core` module and the hook in each app".

Every identifier here came from a previous session. Treat each as a lead to verify.
