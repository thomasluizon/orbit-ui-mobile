/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs and the decision logs) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it rewrites the predecessor id, fixes `SP=` in `mc-prep.sh` and `mc-check.sh`, and links the live builds `mc-h1654` (built at `b0bc7fa2`), `mc-c1664` (built: `redesign/main` `8123af2a` plus `ui#1664` `0e2a21c0`, `ui#1680` and `ui#1682`), `mc-c1680`, `mc-n2`, `mc-h1664`, `mc-h1681` and `base` from the predecessor scratchpad (session id starting `4cb4a71e`). After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. Write any helper whose redirect target is a variable with the Write tool (the guardrail refuses a redirect into `$VAR` paths; use literal paths), run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `pr-file-overlap.sh <pr> <other>...`; `c-build.sh`; `head-build.sh <label> <sha>`; `run-spec.sh <built worktree> <label> <spec>...`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md` (base `redesign/main`; for a `main` ticket call `tools/compose-prompt.mjs --base main` directly), then a case in `launch-rb.sh`; `new-ticket-wt.sh <issue> <name> [prefix] [base]`, `prep-npm.sh`, `gated-launch.sh`; `extract-report.sh <worker log> <out>` and `batch-merge-body.sh <pr> <report> <sha prefix>`; `add-pr.mjs <pr> '#<issue>' <worktree name> <branch>` and `mark-merged.mjs <pr> <merge sha> '#<issue>'`; `reconcile.mjs`. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000. A ticket that GitHub auto-closes from a `main` merge takes `node tools/complete-ticket.mjs --issue <n> --repair-status`; read its state first rather than chaining the two with `||`.

## Then: the in-flight work, in this order (harness first)

The spec's `## Current state` carries every detail below.

1. Start CI waiters (at most three; fold pull requests): `ui#1664` (head `662c05d0`), `ui#1690` (layout rerun of run 38014528979 in progress).
2. `ui#1664` (`#1301`): on green CI plus a Pullfrog approval of `662c05d0` submitted after its first `pull_request` run (request one with `node tools/list-bot-threads.mjs --pr 1664 --repo ui --wait-seconds 900 --re-review` if none arrives), merge with `--match-head-commit 662c05d0bb7d86c8772c62580981de1aa30167f7` after `ready.sh 8123af2a4 1664`, close `#1301` with `tools/complete-ticket.mjs`, tear down its worktree, then compose and launch `#1306`, `#1307` and `#1317` with their notes (`compose-note.sh`, then `prep-npm.sh` and `gated-launch.sh` with `--hard-ceiling-minutes 75`), spaced by the gate.
3. `ui#1690` (`#556` round): merge on the bar after the rerun; comment on `#556`, leave it open.
4. After `ui#1664` merges, batches in this order: `ui#1654` (base merge plus `calendar-day-circle.spec.ts` onto `LAYOUT_FIXED_TIME`, on top of the three unpushed commits; then prove the seven calendar specs on a build of its head and push once); `ui#1686` (`note-1318-crash.md`: the Calendário crash at its root plus the base merge and the two cap cases); `ui#1681` batch 2 (`note-1324-rb2.md`); `ui#1673` second base merge; `ui#1653` batch 5 recomposed with the second base merge. Every base merge moves any spec that sets its own clock onto `LAYOUT_FIXED_TIME`. Then `ui#1673`, `ui#1653` and `ui#1654` merge together on one combined check. Then `ui#1674` (its batch), `#1316`, `#1299`.
5. `ui#1669`'s staging sleep proof on `https://app-staging.useorbit.org`, any time between 00:15 and 08:00 Sao Paulo: the page wakes the sleeping API and loads without an error screen; record the network trail.
6. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132) to the internal track, and run a full rendered sweep of the released commit at 600, 840, 1100 and 1352, dark and light, with the keyboard Tab traversal on the four roots, when the Mac is idle (`ioreg -c IOHIDSystem` HIDIdleTime above 300 seconds).
7. Then the rest of Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1664` `662c05d0` (`#1301`) | batch 7 pushed (base merge `6b111133` plus the guarded clock spec `662c05d0`), body merged, zero threads; CI running, fresh approval pending (steps 1, 2) |
| `ui#1690` `25386c12` (`#556` round 4) | approved; Layout Guard flake rerun in progress (steps 1, 3) |
| `ui#1654` (`#1286`) | `3b25e940`, `b0bc7fa2`, `89448651` UNPUSHED in `ticket-1286-calendar-day-circle`; next batch after `ui#1664` (step 4) |
| `ui#1686` `cb0b01ff` (`#1318`) | approved, red; crash traced to `use-calendar-data.ts`; batch after `ui#1664` (step 4) |
| `ui#1681` `ad36f0f5` (`#1324`) | changes requested; `a28ddcf3` UNPUSHED; batch 2 after `ui#1664` (step 4) |
| `ui#1653` `d07ab3b6` (`#1293`), `ui#1673` `9c0aa7a7` (`#1298`) | approved, conflicting; after `ui#1664` (step 4) |
| `ui#1674` `c4eeec60` (`#1300`) | approved; batch after `ui#1673` (step 4) |
| Merged this session | `ui#1680` `47943c02` (`#1323` closed), `ui#1682` `987062ca` (`#1320` closed); both worktrees torn down |
| Workers, subagents, workflows | none running |
| Background checks | none; the `check-c1664` combined check and the `ui#1686` probe finished (`seq6.log`, `probe-1686-on-1664.log`) |
| CI waiters | stopped by the relay tool; start them (step 1) |
| Staging | API `86e7467c`, web `aa14c594`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1653`, `ui#1654`, `ui#1664`, `ui#1673`, `ui#1674`, `ui#1681`, `ui#1686`, `ui#1690`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | `ticket-1286-calendar-day-circle`: `3b25e940`, `b0bc7fa2`, `89448651` (step 4); `ticket-1324-astra-thread-scroll`: `a28ddcf3` (step 4); `ticket-1242-week-grid-one-scroller`: `40200ee4` on a branch whose `ui#1633` is closed (kept, as before) |
| Branches with no pull request | `fix/ticket-1323-*`, `fix/ticket-1320-*`, `fix/ticket-1327-*`, `fix/ticket-556-carry-docker-mirror` (merged, kept by teardown) and the older ones the spec lists |
| Detached HEADs | scratch build worktrees `mc-*` and `base` in this and older scratchpads; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água; no sweep tab open |
| Session chain | open; this is an automatic relay |
| Owner questions | none open (the owner ran `/questions` and `/progress` this session; both answered) |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits on `HEAD_MOVED`, `PR_CLOSED` or a transient `READ_ERROR`, so restart it); read `gh run list --commit <sha>` before calling a check red (a cancelled duplicate beside a green rerun is not red); a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (worker reports carry em dashes); after a body merge, replace every "Playwright was not run" claim the local proof answers; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A layout red that needs a cause gets a probe spec (copy a small diagnostic spec into a scratch build, tag its output `[DEBUG-xxxx]`, log the measured boxes, buttons, API calls, console errors and page errors, delete it after) before a batch is ordered; attribute a red with builds of the base with and without one head before sending it to that head. A pull request that shares files with `ui#1664` takes its next batch only after `ui#1664` merges, so the base merge happens once. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: continue the work until the redesign is done; harness tickets first, then the rest of the design. When everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 12 open redesign and harness tickets in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 138 open, 138 placed, 0 unplaced (`reconcile.mjs`), 0 placed twice by placement (cross-references in a second batch remain, as before). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried (build links updated; the owner added "continue the work until the redesign is done").
- Step 1, background checks: done. The contaminated `c1664` layout run was stopped and one combined check ran on the new base with `ui#1664`, `ui#1680` and `ui#1682` (1,756 of 1,762; the 6 reds and the web guard red are the spec batch 7 fixed); `mc-h1654` specs ran (5 reds, a read race, batch 2 `89448651`); the `ui#1686` probe ran (crash persists, traced, carried in step 4); the `c1680` layout step was folded into the combined check.
- Step 2, waiters: done and carried (step 1).
- Step 3, `ui#1664`: carried (step 2) after batch 7.
- Step 4, `ui#1690` and `ui#1682`: `ui#1682` merged (`987062ca`); `ui#1690` carried (step 3).
- Step 5, `ui#1654`: carried (step 4) with batch 2 and the clock conversion.
- Step 6, `ui#1680`: done, merged (`47943c02`).
- Step 7, the post-`ui#1664` batches: carried (step 4).
- Step 8, `ui#1669` staging sleep proof: carried (step 5).
- Step 9, staging release, Orbit Staging 1.3.73 and the sweep: carried (step 6).
- Step 10, Batch R then the order: carried (step 7).

Every identifier here came from a previous session: treat each as a lead to verify.
