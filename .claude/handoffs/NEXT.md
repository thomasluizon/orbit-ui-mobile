/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec. On `main`, `run-state.mjs` has no `updateRunState` until `ui#2392` merges: change the record with `writeRunState({ ...readRunState(), ... })`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 39be95a1-b20c-480f-bbd2-ee23c2318a3b` as a background task (literal absolute paths, no `$HOME` in a redirect target) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D8). Helpers: `gl.sh` (gated launch), `co-rb.sh` (commit-only ui order), `joblog.sh <repo name> <job id>` (a job log without escape codes), `fetch-threads-any.sh <repo name> <pr>...`, `append-note.sh`, `run-spec.sh`, `repro-2077.sh`, `repro-2083-gap.cjs` and `repro-2083-gap-origin.cjs`. Write scratchpad files with the Write tool or a heredoc to a literal absolute path: the guardrail refuses a redirect to a path built from a variable. Start every waiter as a Bash background task, never with a trailing `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` (not 0) to post the review request.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `21f6045ae`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2395` (`#2085`) | Batch `25ce52f57` plus merge `eb25be55f`, unpushed in worktree `ticket-2085-relay-quiet-point`; the diff is read and answers all four threads. Detached check `check-2085-suites.sh` runs both suites at that head; its completion file is `check-2085-suites.done.json` and its original ISO start is in `check-2085-suites.started` (both in the scratchpad). Start `node tools/wait-file.mjs --file <absolute completion file> --started-at <that start> --what "2085 suites"` as a background task. On `exitCode` 0, write the evidence into the PR body, resolve the four threads, push, request the review. |
| `ui#2392` (`#2081`) | Head `531e9f362`, CI green, Pullfrog run 42681822240 was reviewing. Wait with `--require-check pullfrog-approval`, merge on approval. |
| `ui#2397` (`#2084`) | Head `386b6fe0a`, CI green, review requested. Wait with `--require-check pullfrog-approval`, merge on approval. |
| `ui#2393` (`#2083`) | CI fix `eea81193f` pushed (sign-in-gap fixture on an http origin; repro red 0 of 4 sections, green 4 of 4). Wait on CI; if `calendar-header-controls-geometry.test.tsx` fails again, reproduce it under load and fix it. Then request the review. |
| `ui#2396` (`#2086`) | Whole CI run 42674418242 rerunning (GitHub abandoned three shards). Wait on CI, then request the review. |
| `ui#2394` (`#2087`) | Failed job `installed (macos-latest, Developer ID)` rerunning once in run 42674542896. If it fails again, read the log with `joblog.sh` and fix the cause. Then request the review. |
| `landing#128` (`#2082`) | Head `d8713e19b`, CI green, second review COMMENTED with two threads. Note `note-2082-rb2.md` is written: compose the landing review-batch order from it, launch, read, resolve, push, review; copy verdict before merge. |
| `ui#2389` (`#2077`) | Layout red at `4686f7094`. `repro-2077.sh` timed out at the web server start (`next start` with `output: standalone`). Match the CI layout job's server start in `run-spec.sh`, prove the cause red, then compose and launch the CI-fix order. |
| `ui#2388` | This relay's docs branch; CI runs on each relay push. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2392`, `#2389`, `#2388`; api none; landing `#128`. Unpushed: `25ce52f57` and `eb25be55f` on `feature/ticket-2085-relay-quiet-point`. Stashes: 0 in all three repositories. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: `check-2085-suites.sh` (above). No CI waiter is live: start one over ui `#2393`, `#2394`, `#2396`.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate: the `#2085` file waiter and one CI waiter first, then the `landing#128` launch and the `#2077` repro. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry is due one hour after the last listing in `intake.wake`).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; the `ui#2397` review requested; the `ui#2394` macOS job rerun once; the `ui#2396` failure read (abandoned shards, whole run rerun); the `ui#2393` failures read, the sign-in-gap cause proven red and the CI fix `eea81193f` proven green and pushed; the `#2085` diff read against the four threads.
- Carried: the `#2085` suites, push and review; the `landing#128` second batch (note written); the `ui#2389` CI fix; the `ui#2392` and `ui#2397` approval waits; every review and merge; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "start a CI waiter over ui `#2388`, `#2393`, `#2394`, `#2396`, `#2397`" (`ui#2397` is green and in review; the new waiter covers `#2393`, `#2394`, `#2396`).

Every identifier here came from a previous session: treat each as a lead to verify.
