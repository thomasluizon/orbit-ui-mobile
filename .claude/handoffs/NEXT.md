/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB; `prune-durable.sh` in the scratchpad deletes only redundant run-carry mirrors; set its `NEW` to this session's mirror and `KEEP` to the predecessor's). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi` (replace the predecessor's 8-character id), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D11). Helpers: `run-spec.sh`, `run-tools-hooks.sh <worktree> <label>`, `mark-merged.mjs` (ledger merge sha), `wait-main-push.sh` (main push CI for a release), `log-decision.sh`, `launch-ticket-ui.sh`, `launch-ticket-api.sh`, and the `proof-2077-*.sh` scripts (emulator capture and staging QA sign-in pattern). Write scratchpad scripts with the Write tool and literal absolute paths; macOS has no `setsid`, so detach with `nohup` and a `wait-file.mjs` waiter. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, and it needs a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 13 open, 13 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `733cd2d4b`; API `main` `0def909d5`; landing `main` `5d9971870`. Production web `b9ed49284` with desktop 0.1.27; staging web `b9ed49284` with staging desktop 0.1.28; Android Open 1.3.150 (210) from `f643f107d`; TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| `ui#2402` (`#2079`) `a6012c2c4` | CI green, review 1 fixed, the review-approval waiter exited 0 at this head. Read the review body and threads; merge `main`, CI, review again, merge, dismiss alert 54 as `false positive` (comment of 280 characters or fewer naming the new test), close `#2079`. |
| `ui#2394` (`#2087`) `291f2a3fb` | CI green, delivery verified with the branch's own tool, review requested. After approval merge `main`, CI, review again, merge, then the desktop release (staging first). |
| `ui#2404` | Bot contract snapshot rebaseline (`chore/contract-snapshot`). Read the snapshot diff; update hand-written Zod types only if the consumed contract changed; drive CI, review and merge. |
| `#2078` | `ui#2401` merged (`dc825701b`); alert 52 already reads `fixed`. Close it with that evidence. |
| `#2086`, `#2089` | Merged and in `main`. One production web release (staging first) from the newest `main` whose `test.yml` and `guards.yml` push runs passed; then close `#2086`; resolve `ORBIT-WEB-1E` only after that release shows no new event, then close `#2089`. |
| `#2030` | Close on the owner-device `android_update_sheet_shown` PostHog event once his phone runs 1.3.150. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2404`, `#2402`, `#2394`, `#2388`; api none; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Detached checks: none. The `ticket-2077-expo-patch-set` worktree is detached at `dc825701b` (proof build only, no unique commits). Intake this session: Sentry two issues, no new event; mailbox and Play reviews empty.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. `#1560` once Batch 6 merges (the folded CI timeout included), then the rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `#2071` question re-added; `ui#2401` merged (`dc825701b`); `ui#2403` review 1 (WebKit `AbortError`) fixed and merged (`733cd2d4b`); `ui#2403` PR Metadata parity line fixed; Android Open 1.3.150 (210) released; `#2077` proven on the throwaway AVD and closed; `#2083`, `#2061`, `#2062` closed; AVD `orbit-repro-2030` deleted; intake cycles.
- Carried: `ui#2402`, `ui#2394` to merge; production web for `#2086` and `#2089`; closes for `#2078`, `#2079`, `#2086`, `#2089`, `#2030`; `#1560`, `#1561`, `#1563`, `#315`, `#33`, intake, `#2071`, `#2074` on or after 16 November 2026; run `npm ci` in the main checkout at a quiet point (no waiter importing packages), because local `check-native-module-copies` fails there and in the worktrees.
- Superseded: "Android Open 1.3.150 from the newest passing `main`" (released); "delete the AVD after the `#2077` proof" (deleted).

Every identifier here came from a previous session: treat each as a lead to verify.
