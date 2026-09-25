# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, including its standing instructions and its last section,
"What the 2026-09-25 night sleep run added (session `160fb698`)".

## Entry point

`/sleep`. It is the only entry point; it runs `/orchestrate` itself. Thomas is asleep: take every decision
yourself, the best approach, and log it.

## The goal: finish the spec

An empty board and a production release, exactly as the spec defines it. The run ends only when the spec is
done, or externally (allowance exhausted, machine stopped, Thomas says stop). A blocker is the next piece of
work. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

177 tickets were open at this handoff.

## In flight, each with a disposition

Launch Codex workers about 90 seconds apart, never several at once (spec, rules of this run).

| item | state at handoff | disposition |
|---|---|---|
| `ui#1107` (`#691` main sync) | APPROVED at `2dc28f6b`, contains `redesign/main` `f2ca0c49`, CI was settling | land it FIRST by fast-forwarding `redesign/main` to its approved head (normal push, never squash); merge no other redesign PR before it. If `redesign/main` moved, merge it in, lint + type-check, get a fresh approval, then fast-forward |
| `#692` (redesign admission, main's `2db3f2e6`), `#693` (main Android checklist keys) | not started | launch right after `ui#1107` lands, in that order |
| `ui#1110` (`#666` child completion reasons) | round 1 pushed `16ad5490`, review pending | clear the review, merge to `redesign/main` after `ui#1107` |
| `ui#1111` (`#675` Turnstile redesign port) | round 1 pushed `5db4ac35`, review pending | clear the review, merge to `redesign/main` after `ui#1107` |
| `ui#1113` (`#620` caution pill) | delivered `52c25eb5`, first review pending | review, merge to `redesign/main` after `ui#1107` |
| `ui#1114` (`#674` reminder permission) | delivered `cb34aeaf`, first review pending | review, merge to `redesign/main` after `ui#1107` |
| `ui#1115` (`#696` Turnstile re-render on `main`) | delivered `be324b59`, first review pending | review, merge to `main`; must land before any Turnstile switch-on |
| `ui#1112` (automated contract snapshot, `main`) | snapshot-only, review pending | merge to `main` on approval and green CI |
| `#680` (Progresso chart + Astra metrics and insight) | worktree `orca/workspaces/orbit-ui-mobile/ticket-680-astra-metrics`, branch `feature/ticket-680-astra-metrics`, 3 unpushed commits (head `902ac324`, the insight pager) and 12 dirty files, no PR | read the worktree first; relaunch its worker with `--relaunch-reason` to finish, commit, push and open the PR (decision for the pager is on the ticket) |
| `#600` (account change keeps state, `main`) | worktree `ticket-600-account-store-reset`, clean, no commits | launch its worker (order `600` note: target `main`) |
| `#291` (landing waitlist Turnstile throw, `main`) | worktree `orca/workspaces/orbit-landing-page/ticket-291-turnstile-render-throw`, clean | launch its worker, `--relaunch-reason` (two earlier attempts ended in 30 s) |
| `#389` (api bulk log/skip idempotent, `main`) | worktree `orca/workspaces/orbit-api/ticket-389-bulk-log-idempotent`, clean | launch its worker |
| `#681` (other Astra read blocks) | blocked by `#680` | after `#680` merges |
| `#682` (diff rows, thinking trace, chips) | blocked by `#24` | pick up `#24` Stage 3 by leverage |
| running workers, stashes, uncommitted work in the three main checkouts | none, 0, none | none |
| run record | `.git/orbit-orchestrate-run.json`, session `160fb698`, `sleep: true` | a new session writes its own; carry the open rows |

## What to do, in order

1. Land `ui#1107` by fast-forward, then launch `#692` and `#693`.
2. Clear and merge the reviewed PRs above, `main` ones any time, redesign ones after step 1.
3. Relaunch `#680`, `#600`, `#291`, `#389`, spaced out.
4. Then the board by leverage (`node tools/plan-queue.mjs --board`), live defects on `main` first, redesign
   work to `redesign/main` (spec, route by subject).

Every identifier here came from a previous session. Treat each as a lead to verify.
