/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs and the decision logs) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it rewrites the predecessor id, fixes `SP=` in `mc-prep.sh` and `mc-check.sh`, and links the live builds `mc-h1654`, `mc-c1680`, `mc-n2`, `mc-h1664`, `mc-h1681` and `base` from the predecessor scratchpad (session id starting `7891d2ff`). After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. Write any helper whose redirect target is a variable with the Write tool (the guardrail refuses a redirect into `$VAR` paths; use literal paths), run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `pr-file-overlap.sh <pr> <other>...`; `c-build.sh`; `head-build.sh <label> <sha>`; `run-spec.sh <built worktree> <label> <spec>...`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md` (base `redesign/main`; for a `main` ticket call `tools/compose-prompt.mjs --base main` directly), then a case in `launch-rb.sh`; `new-ticket-wt.sh <issue> <name> [prefix] [base]`, `prep-npm.sh`, `gated-launch.sh`; `extract-report.sh <worker log> <out>` and `batch-merge-body.sh <pr> <report> <sha prefix>`; `add-pr.mjs <pr> '#<issue>' <worktree name> <branch>` and `mark-merged.mjs <pr> <merge sha> '#<issue>'`; `reconcile.mjs`. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000. A ticket that GitHub auto-closes from a `main` merge takes `node tools/complete-ticket.mjs --issue <n> --repair-status`; read its state first rather than chaining the two with `||`.

## Then: the in-flight work, in this order (harness first)

The spec's `## Current state` carries every detail below.

1. Read what the background checks left in the scratchpad: `check-c1680/summary.txt` (ui#1680 combined check; layout step), `spec-h1654.log` (ui#1654 probe on its merged head), `probe-1686.log` ([DEBUG-c1e8] Calendário view switch box). A run killed by the relay leaves the mock API (5099) and `next-server` (3000) listening: kill those listeners first, then rerun what did not finish (`FORCE_CI=1 mc-check.sh <scratchpad>/mc-c1680 c1680`, `run-spec.sh` on `mc-h1654`, `probe-1686.sh`). Confirm `mc-n2` has no leftover `zz-probe-1686.spec.ts` or edited spec (`git -C mc-n2 status --short`).
2. Start CI waiters (at most three; fold pull requests): `ui#1664`, `ui#1682`, `ui#1688`, `ui#1689`, `ui#1680`, `ui#1686`.
3. `ui#1664` (`#1301`, harness): when `Unit Tests` passes (redesign runs take about 66 minutes), run its D115 check and merge; close `#1301`; then launch `#1306`, `#1307` and `#1317` (each with an overlap note; orders have no UI sweep heading, so launch through `gated-launch.sh` without `--allow-subagents`).
4. `ui#1689` (`#1327`, base `main`): merge on the bar, close `#1327`. `ui#1688` (`#556` carry): merge on the bar after CI and a review. Then a `#556` round for `eda042fc` (`ui#1687`) and `ui#1689`'s merge.
5. `ui#1680` (`#1323`): merge when the `mc-c1680` layout step passes. `ui#1682` (`#1320`): merge after CI and a fresh approval of `e95cb358`.
6. After `ui#1664` merges: `ui#1686` batch (base merge, fix `content-cap-edge.spec.ts`'s view-switch reference using the probe's measurement, move `avisos-content-edge` and `subscreen-start-edge` to the new cap contract), proven locally before its push; `ui#1681` batch 2 (base merge first, then `note-1324-rb2.md`); `ui#1653` batch 5 recomposed with the second base merge; `ui#1673` second base merge.
7. `ui#1654`: from the probe, send one fix batch for the reds that still fail on `3b25e940`, prove them locally, then push the merge and the fix once. Then `ui#1673`, `ui#1653` and `ui#1654` merge together on one combined check. Then `ui#1674` (its batch), `#1316`, `#1299`.
8. After 00:15 Sao Paulo: `ui#1669`'s staging sleep proof on `https://app-staging.useorbit.org` (the page wakes the sleeping API and loads without an error screen; record the network trail).
9. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132) to the internal track, and run a full rendered sweep of the released commit at 600, 840, 1100 and 1352, dark and light, with the keyboard Tab traversal on the four roots, when the Mac is idle (`ioreg -c IOHIDSystem` HIDIdleTime above 300 seconds).
10. Then the rest of Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1664` `0e2a21c0` (`#1301`) | approved 00:05:00Z after its push, zero threads; `Unit Tests` running at relay (step 3) |
| `ui#1688` `025794fc` (`#556` carry of `57242efd`, `e8deff18`, `2c9bd6e7`, `b6b47f01`) | new; CI and review pending (step 4) |
| `ui#1689` `49b179ab` (`#1327`, base `main`) | approved 00:59:30Z; CI pending (step 4) |
| `ui#1680` `e75df5f9` (`#1323`) | approved, CI green; combined check passed all but the layout step, which was running (steps 1, 5) |
| `ui#1682` `e95cb358` (`#1320`) | batch 2 pushed, thread resolved; CI and review pending (step 5) |
| `ui#1686` `cb0b01ff` (`#1318`) | approved but red on its own head (41 layout cases); red on base proven; probe pending (steps 1, 6) |
| `ui#1654` (`#1286`) | base merge `3b25e940` UNPUSHED in `ticket-1286-calendar-day-circle`; probe on `mc-h1654` running (steps 1, 7) |
| `ui#1681` `ad36f0f5` (`#1324`) | changes requested; `a28ddcf3` UNPUSHED; batch 2 waits for `ui#1664` (step 6) |
| `ui#1653` `d07ab3b6` (`#1293`), `ui#1673` `9c0aa7a7` (`#1298`) | approved, conflicting; wait for `ui#1664` (step 6) |
| `ui#1674` `c4eeec60` (`#1300`) | approved; batch after `ui#1673` (step 7) |
| Merged this session | `ui#1685` `b6b47f01` (`#1325`) and `ui#1687` `eda042fc` (`#1326`) into `main`; both tickets Done, worktrees torn down |
| Workers, subagents, workflows | none running |
| Background checks | `mc-c1680` layout run, `probe-1654.sh`, `probe-1686.sh` (step 1) |
| CI waiters | stopped by the relay tool; start them (step 2) |
| Staging | API `86e7467c`, web `aa14c594`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1653`, `ui#1654`, `ui#1664`, `ui#1673`, `ui#1674`, `ui#1680` to `ui#1682`, `ui#1686`, `ui#1688`, `ui#1689`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | `ticket-1286-calendar-day-circle`: merge `3b25e940` (step 7); `ticket-1324-astra-thread-scroll`: `a28ddcf3` (step 6); `ticket-1242-week-grid-one-scroller`: `40200ee4` on a branch whose `ui#1633` is closed (kept, as before) |
| Branches with no pull request | `fix/ticket-1325-*`, `fix/ticket-1326-*` (merged, kept by teardown) and the older ones the spec lists |
| Detached HEADs | scratch build worktrees `mc-*` and `base` in this and older scratchpads; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água; no sweep tab open |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits on `HEAD_MOVED`, `PR_CLOSED` or a transient `READ_ERROR`, so restart it); read `gh run list --commit <sha>` before calling a check red (a cancelled duplicate beside a green rerun is not red); a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (worker reports carry em dashes); after a body merge, replace every "Playwright was not run" claim the local proof answers; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A layout red that needs a cause gets a probe spec (copy a small diagnostic spec into a scratch build, tag its output `[DEBUG-xxxx]`, log the measured boxes, buttons, API calls, console errors and page errors, delete it after) before a batch is ordered; attribute a red with builds of the base with and without one head before sending it to that head. A pull request that shares files with `ui#1664` takes its next batch only after `ui#1664` merges, so the base merge happens once. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: harness tickets first, then the rest of the design. When everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 16 open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 141 open, 141 placed, 0 unplaced (`reconcile.mjs`; `#1327` placed in Batch R's harness line this run), 0 placed twice by placement (cross-references in a second batch remain, as before). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried (build links updated to this session's builds).
- Step 1, waiters: done and carried (step 2; `ui#1664`'s Guards on `0e2a21c0` re-ran green, run 38006510823).
- Step 2, `ui#1664`: carried (step 3); approval now follows its push, only `Unit Tests` left.
- Step 3, `ui#1685` provenance risk, merge, `#556` carry, `#1326`: done (`ui#1685` batch 1 `432878d2` set `provenance: false` on both release pushes with a guard, merged `b6b47f01`; `#1326` opened `ui#1687`, merged `eda042fc`; `#556` carry opened `ui#1688`, carried in step 4).
- Step 4, `ui#1681` batch 2: carried (step 6), deferred until `ui#1664` merges because it adds a mock route `ui#1664` moves.
- Step 5, `ui#1680` and `ui#1682`: carried (step 5); `ui#1680` combined check run, `ui#1682` batch 2 pushed with the new P2 thread fixed.
- Step 6, `ui#1653` batch 5, `ui#1654` probe, `ui#1673`, `ui#1674`, `#1316`, `#1299`: `ui#1654` base merge done and probe started (step 7); the rest carried (steps 6 and 7), `ui#1653` deferred until `ui#1664` merges.
- Step 7, `ui#1686` red proof: red on base done (18 of 21); its own head is red, carried (steps 1 and 6).
- Step 8, `ui#1669` staging sleep proof: carried (step 8).
- Step 9, staging release, Orbit Staging 1.3.73 and the sweep: carried (step 9).
- Step 10, Batch R then the order: carried (step 10).
- New: `#1327` (main-only flaky calendar hook test) filed by the `#1326` worker, placed in Batch R's harness line, opened `ui#1689` (step 4).

Every identifier here came from a previous session: treat each as a lead to verify.
