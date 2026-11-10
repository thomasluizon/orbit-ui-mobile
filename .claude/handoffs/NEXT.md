/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; a new UI worktree costs about 2 GiB). Adoption carries `openOwnerQuestions` (the App Store Connect sign-in); read it back.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D17 onward). Helpers: `main-into.sh`, `launch-ticket-gl2.sh <key> <n> <worktree> main <tier>` (after `tools/create-worktree.mjs` and the contract branch), `launch-rb-2098.sh` (batch pattern), `body-merge.sh <gh repo> <pr> <worker log> <label>`, `landing-script-bytes.cjs <dist>`, `landing-sweep.cjs <dist> <label>`. Write scratchpad scripts with the Write tool and literal absolute paths; a redirect target holding a shell variable is refused. Start every waiter as a Bash background task with `run_in_background`, never with `&`. `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `691323673`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; staging and production web `691323673`; desktop production 0.1.29; Android Open 1.3.151 (211), 1.3.152 (212) dispatched; TestFlight production 1.3.152 (1).

| Item | Disposition |
| --- | --- |
| Android Open 1.3.152 (212), run 42919315374 | Succeeded; carries the `#2094` Android button. |
| `ui#2412` (`#2094`) | Head `aba4247a3`, CI green, round 2 requested, waiter running. Merge at a fresh approval and zero threads; close `#2094` after the Android Open run succeeds. |
| `ui#2414` (`#1561`) | Head `0b3523681` (CodeQL 57 fixed, 56 dismissed), CI waiter running. On green: request the review (2-launch cap: the coordinator writes any batch). After merge: production iOS Release from `main` 1.3.152 (2), read the `TestFlight access` summary. |
| `ui#2415` (`#2098`) | Round 1 batch commit `e66bd3430` is unpushed (worker log `#2098-11176-1794351950755-worker-account.log`). Read the diff, `body-merge.sh`, reply to and resolve both round 1 threads, push, then CI and round 2. Merge first when approved, then `main-into.sh` every open UI branch. |
| `ui#2413` | Dependabot; PR Tests run 42899645155 rerun once for the web test budget red, CI waiter running. On green: request the review, merge at the bar. A second budget red: investigate `habit-list-scroll-geometry.test.tsx`. |
| `landing#130` (`#2091`) | Head `4c762c1` (rendered startup 19,586 bytes, sweep passed), CI green, review requested, waiter running. Merge at the bar (2-launch cap). |
| `landing#129` (`#2090`) | Head `a66fb885f` (rendered startup 19,948 bytes). Round 1: three P1 threads (first press counted twice; focus drops on a keyboard pick; `#downloads` opens under the header). Coordinator writes the batch (2-launch cap). Run `landing-sweep.cjs` before merge. After both landing merges: launch `#2095` (it must stay under the 9,228-byte startup test), then landing staging and production. |
| `#2099` to `#2105` (motion areas from `#2096`) | Admitted in `remaining`, no worktree yet. Launch one worker each (tier default, parity bound), within the load gate. |
| `#2097` App Store review | App Store Connect still shows the login page. Adapt the live Play listing (both locales) for iPhone and iPad, then `/second-opinion`. After the owner signs in: screenshots, subscriptions, App Privacy, submit with manual release. |
| `#2071`, `#2030`, `#2089` | `#2071`: close on the first natural API and landing Pullfrog runs after the secret update (the landing#129 and landing#130 reviews count for landing). `#2030`: the newest `android_update_sheet_shown` is from 1.3.149; close on the first from 1.3.150 or later. `#2089`: resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2415`, `#2414`, `#2413`, `#2412`, `#2388`; api none; landing `#130`, `#129`. Unpushed commits: `e66bd3430` on `chore/ticket-2098-shard-tools`. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Worktrees in use: ui `ticket-2094-apple-variable`, `ticket-1561-testflight-access`, `ticket-2098-shard-tools`; landing `ticket-2091-demo-clock`, `ticket-2090-downloads-panel`. Intake this session: the Sentry listing is due (hourly); mailbox none; Play and App Store reviews none.

## Then, in this order

1. Answer any owner message first, in his language. Tell him plainly when the App Store Connect sign-in is the one thing waiting on him.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs (`main-into.sh`). Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. The App Store Connect sign-in is the one open owner step, already named. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `#1560` verified on the Mac and closed; Android Open dispatched; the `ui#2412`, `ui#2414`, landing#129 and landing#130 reds fixed; `ui#2415` round 1 sent to a batch worker; `#2096` audit posted, `#2099` to `#2105` filed.
- Carried: every in-flight row above; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
