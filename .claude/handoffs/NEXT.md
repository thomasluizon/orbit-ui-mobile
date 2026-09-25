# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, including its standing instructions dated
2026-09-25 and its last section, "What the 2026-09-25 day run added (session `77ddefe6`)".

## Entry point

`/orchestrate`, attended. Thomas is present.

## The goal: finish the spec

An empty board and a production release, exactly as the spec defines it. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

193 tickets were open at this handoff. A blocker is the next piece of work.

## This session is attended, so the conversation tickets come first

Thomas: "next session is not sleep, so we can prioritize the needs:conversation tickets".
Converse one topic at a time (orchestrate step 2b, attended), write each decision to its ticket with
`comment-ticket.mjs`, then run the work. Order, decided at `/wrap-up`:

1. `#320`, competitor onboarding study. It feeds `#217`.
2. `#217`, the first experience: what Orbit teaches, and how.
3. `#318`, Astra's capabilities and how each answer renders (`beautifului.dev`, see the spec).
4. `#666` and `#620`, both labelled `needs:conversation`, both small.

Run the pull-request work below between conversations, while Thomas thinks.

## What to do, in order

1. **Turn off "require branches to be up to date" on `main`** in `orbit-ui-mobile` and `orbit-api`
   (Thomas: "Turn it off"). Read the current protection first, change only `strict`, and read it back.
   Write the brain ADR under `2 Areas/20-29 Orbit Engineering/Decisions/`.
2. **Deliver the two finished review workers** (committed, NOT pushed, trees clean): read each worker
   log, merge its report into the PR body with `merge-review-batch-body.mjs --ui-scope`, resolve the
   thread, push once.
   - `ui#1090` (`#392`): `ticket-392-returning-guidance`, head `59a1832e`, 3 unpushed, fixes thread
     `PRRT_kwDOR5Siws6mCatk` (next/link).
   - `ui#1049` (`#559`): `ticket-559-spacing-web-constants`, head `b6e3d68a`, 3 unpushed, fixes thread
     `PRRT_kwDOR5Siws6mCX1w` (destructuring targets).
3. **`ui#1096`** (`#667`, fonts): forwarded to `9f45242b`, no review at that head yet. Wait, then
   request if none lands; merge when approved. It carries `parity:exempt`.
4. **`api#556`** (`#670`, orbit-api `main` into `redesign/main`): new High finding at `bb086b30`,
   "Resolve stored week anchors independently of the current preference". Fix round, then merge; then
   retarget `api#531` (`#367`) and `api#532` (`#75`) onto `redesign/main`.
5. **orbit-api `main` chain**: `api#552` (`#325`) is forwarded locally in
   `ticket-325-habit-log-duplicate-recovery` (15 unpushed, stale now that `#549` and `#557` merged):
   merge `origin/main` again, regenerate the map, build, test, push, request review, merge. Then
   `#554`, `#550` (inert until Turnstile), `#530`, `#535`.
6. **Backports and ports owed** (queued in the run record): `main` backports of `#631`, `#658`, `#615`
   and `#667`; the `redesign/main` port of `#668`. The admission gate allows a new branch only at 10
   or fewer open PRs.
7. **Turnstile** (Thomas: "Add it to sign-in, then turn on", on `#107`): file the web and Android
   sign-in widget ticket, build it, then ask Thomas for the Cloudflare secret.
8. **`#673`** (flaky tampered-token test) and **`#672`** (`main` harness on macOS): both need no
   conversation.
9. When Pullfrog publishes 0.1.83 (`npm view pullfrog version` was 0.1.82), re-review the pins
   `ui#1046`, `api#537`, `landing#80`.

## In flight, each with a disposition

| item | state | disposition |
|---|---|---|
| `ui#1090`, `ui#1049` worker commits | unpushed, trees clean | step 2 |
| `ui#1096` | approved earlier, forwarded to `9f45242b`, awaiting review | step 3 |
| `api#556` | CHANGES_REQUESTED at `bb086b30`, 1 High thread | step 4 |
| `api#552` local forward | 15 unpushed commits, stale base | step 5 |
| `api#554`, `#550`, `#530`, `#535`, `#531`, `#532` | open on `main`, not current | steps 4 and 5 |
| pins `ui#1046`, `api#537`, `landing#80` | wait for Pullfrog 0.1.83 | step 9 |
| running workers | none (all exited) | none |
| stashes | 0 in all three repositories | none |
| `menu-probe` worktree (4 debug edits, detached `959381da`) | commit is on `origin/main` | leave |
| run record `.git/orbit-orchestrate-run.json` | session `77ddefe6`, `sleep: false`, 25 remaining, 94 ledger rows | a new session writes its own; carry the ledger rows it owns |
| decision log (D1 to D48) | session scratchpad | durable content copied into the spec section |
| `.claude/orchestrator.json` cap edit | reverted (10) | none |
| keep-awake hook | `~/.claude/hooks/keep-awake.mjs`, user settings | confirm `ps -axo args | grep "caffeinate -ims -w"` shows the new claude pid |

Every identifier here came from a previous session. Treat each as a lead to verify.
