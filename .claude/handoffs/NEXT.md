/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 39be95a1-b20c-480f-bbd2-ee23c2318a3b` as a background task and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. Repoint any helper whose `SP=` still names an old session. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D9). Helpers: `gl.sh` (gated launch), `prep-any.sh` (worktree plus order), `co-rb.sh` (commit-only order: ticket, worktree, order name, note file), `append-note.sh`, `run-spec.sh`, `repro-2077.sh`. Write files in the scratchpad with the Write tool or a heredoc to a literal absolute path: the guardrail refuses a shell redirect to a path built from a variable. Detach a local check with `nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' <script> &`. Kill a process only by its recorded pid, never with `pkill` options after the pattern.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `21f6045ae`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| `ui#2392` (`#2081`) | Worker commit `531e9f362` in worktree `ticket-2081-run-state-lock`, unpushed by design. Read the diff, resolve both threads, push, request the review. |
| `ui#2396` (`#2086`) | Red. The order `order-2086-ci1.md` is composed; launch it with `gl.sh` (`--tier default --relaunch-reason`), read the diff, push, request the review. |
| `ui#2395` (`#2085`), `ui#2393` (`#2083`), `ui#2394` (`#2087`), `landing#128` (`#2082`) | Pullfrog COMMENTED (spec bullets list each thread and its FIX). Compose one `co-rb.sh` batch per pull request, launch, resolve, push, request the review. `landing#128` also needs the `/second-opinion` copy verdict on the PR. |
| `ui#2389` (`#2077`) | Layout red at `4686f7094`. Run `repro-2077.sh` (the server starts by hand on 3100), prove the cause red, then compose and launch the CI-fix order. After merge: production web and Android Open with `#2062` and `#2061`. |
| `ui#2397` (`#2084`) | In CI. Read the diff against `DESIGN.md`, request the review, merge on approval. |
| `ui#2388` | This relay's docs PR. Request the review after green CI and merge. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2392`, `#2389`, `#2388`; api none; landing `#128`. Unpushed: `531e9f362` on `fix/ticket-2081-run-state-lock` (above). Stashes: 0 in all three repositories. Uncommitted work: none. Running workers: none. Detached checks: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. Push `ui#2392`, launch the `ui#2396` order and the four review batches within the load gate, then one `tools/wait-ci.mjs` over the open pull requests and a `--require-check pullfrog-approval` waiter over the requested reviews; rerun 504-only failures.
3. The in-flight rows above. Record each merge sha in the run ledger at merge time.
4. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
5. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry is due one hour after the last listing in `intake.wake`, which was 17:19 UTC on 9 November).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; the `ui#2395` review requested (COMMENTED); the `ui#2393`, `ui#2394` and `landing#128` verdicts read and classified (all COMMENTED); the `ui#2392` review batch delivered as `531e9f362`; the `ui#2396` CI-fix order composed.
- Carried: pushing `ui#2392`, the `ui#2396` launch, four review batches, the `ui#2389` CI fix, the `ui#2397` review, every merge, the Android Open and production web, the desktop and landing releases, `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "wait on the `ui#2393`, `ui#2394`, `landing#128` verdicts" (all COMMENTED) and "launch the `ui#2392` order" (delivered).

Every identifier here came from a previous session: treat each as a lead to verify.
