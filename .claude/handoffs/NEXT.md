/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, the diagnosis files, the decision log) is in the system temporary directory: copy it with `carry-next36.sh` from that scratchpad (set `NEW_ID` to this session's id; it links the scratch build worktrees `base`, `mc-*` as symlinks), and refresh `$HOME/.orbit-run-carry/scratchpad` from the new scratchpad with `rsync -a --exclude 'mc-*' --exclude base`. Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad: the guardrail refuses a computed redirect target, a process substitution or a here-string.

## First: the in-flight work, in this order

1. Combined check A (`check-mA/summary.txt`: `cc07f739` plus `ui#1637` `716cf160`, `ui#1643` `bacd033e`, `ui#1648` `55478fb6`): every step through the web build exited 0; the layout project was running at the relay. If its layout line is missing, rerun `full-mc.sh mA` with those three heads. On green, with the base and heads unmoved: merge `ui#1643` and `ui#1637` (the run accepted the head-pinned "Pullfrog would approve" check as `ui#1637`'s fresh approval, see `## Current state`), and `ui#1648` once its CI is green; `complete-ticket.mjs` for `#1287`, `#1211`, `#1227`. Copy every `--match-head-commit` SHA from this run's output.
2. `ui#1632` (`#1282`): review batch 3 `5652d5c5` is committed, not pushed. Run `chain-1632.sh` (rerun if it ended with the relay), merge `report-1282-rb3.md` into the body, push once, fresh approval, merge.
3. `ui#1652` (`#1294`): review batch 1 `05a91669` is committed, not pushed. Run `chain-1652b.sh`; on green merge `report-1294-rb1.md` into the body, reply to and resolve both Pullfrog threads on the commit, push once, post the copy verdict from `so-1652-copy2.json`, then a fresh approval and a merge check that includes the full layout project (the batch changes the shared shell height chain).
4. `ui#1655` (`#1291`): run `chain-1655.sh`, post the proof, then CI and Pullfrog.
5. `ui#1645` (`#1256`, `69d59372`, pushed with its proof and copy verdict): green CI, fresh approval, D115 or combined check, merge.
6. `ui#1653` (`#1293`, `de543253`): prove its new layout spec red on the base and green on the head, then CI and a fresh Pullfrog review.
7. `ui#1654` (`#1286`, approved, proof posted): compose review batch 1 (the month-grid day's native accent ring count, rest 0, selected 1, focused 1, selected and focused 1, per the `#1286` scope comment, plus a base merge of `cc07f739`), launch with `--relaunch-reason`, prove, push, fresh approval, merge.
8. Launch, gated, about 90 seconds apart, with `--allow-subagents --hard-ceiling-minutes 75`: `#1239`, `#1288`, `#1295` (orders `order-<n>.md`, worktrees on `cc07f739` with `npm ci` done). Refresh each overlap note first when a pull request it names has merged (`overlap-now.sh`, `overlap-note.sh`, `recompose.sh`). Run at most six workers while a full layout run or two web builds share the machine. Pass `--relaunch-reason` on the first launch of any branch that already used its two launches.
9. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit (its `orca computer` method, a new tab in the open window with DevTools docked, only while the owner is idle; everything the `1684ecee` sweep did not reach is owed). Verify the 544 versus 580 content edge lead in `## Current state` before filing.
10. Launch as slots free: `#1290` (after `ui#1648` and `#1260`), then `#1298` to `#1302`, and `#1304` on `main` when no UI ticket can launch.
11. Then Batch R in the spec's order (`### Batch R` and `## Current state`), then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1637` `716cf160` (`#1211`) | CI green, 0 threads, "would approve" check accepted; merge on check A (step 1) |
| `ui#1643` `bacd033e` (`#1287`) | CI green, APPROVED after push, 0 threads; merge on check A (step 1) |
| `ui#1648` `55478fb6` (`#1227`) | APPROVED after push, proof posted, one CI job running at the relay; merge on check A (step 1) |
| `ui#1632` `87c6d16f` plus unpushed `5652d5c5` (`#1282`) | approved at the old head; batch 3 committed; prove, push (step 2) |
| `ui#1652` `64e10a32` plus unpushed `05a91669` (`#1294`) | CHANGES_REQUESTED; batch 1 committed, copy approved; prove, push (step 3) |
| `ui#1655` `c2a53e8c` (`#1291`) | opened, unreviewed; prove (step 4) |
| `ui#1645` `69d59372` (`#1256`) | pushed with proof and copy verdict; CI and review pending (step 5) |
| `ui#1653` `de543253` (`#1293`) | pushed; CHANGES_REQUESTED is on its first head; prove and review (step 6) |
| `ui#1654` `5abd0395` (`#1286`) | APPROVED, proof posted; review batch 1 owed (step 7) |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch; no Pullfrog approval posts on them |
| `#1239`, `#1288`, `#1295` | prepared, not launched; the relay stopped `#1239`'s gated launch before its gate passed (step 8) |
| Merged this session | `ui#1651` (`#1296`, `cc07f739`), ticket `#1296` closed |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; `main` has unreleased `edd0e785` and `445639e2` |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1637`, `ui#1638`, `ui#1643`, `ui#1645` to `ui#1648`, `ui#1652` to `ui#1655`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the checkouts or the ticket worktrees; `orbit-api` `main` is 2 behind `origin/main` (no local work) |
| Unpushed commits | `ticket-1282-subscreen-start-edge` (`5652d5c5`, step 2), `ticket-1294-semana-week-view` (6 commits to `05a91669`, step 3), `ticket-1242-week-grid-one-scroller` (1, `ui#1633` closed into `#1294`, leave it) |
| Branches with no pull request | `ticket-1239`, `ticket-1288`, `ticket-1295`; older ones in the spec |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Running workers, subagents | none; the combined check A layout step and the `chain-1632.sh`, `chain-1655.sh`, `chain-1652b.sh` proofs were background shells at the relay and may end with this session; the CI waiters on `ui#1645` and `ui#1648` end with it |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (`extract-final.sh` scrubs worker reports); copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. When the relay threshold fires, stop every queued gated launch whose gate has not passed.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (27 open Batch R tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 154 open, 154 placed, 0 unplaced (`reconcile.mjs`); no ticket was added to the order this session, so placed twice stays 0 as last counted. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried (now `carry-next36.sh`).
- Step 1, merge `ui#1651`: done (`cc07f739`, `#1296` closed).
- Step 2, `ui#1637` fresh approval and merge: carried (step 1); the head-pinned approval check was accepted, the merge waits on check A.
- Step 3, launches: `order-1287-rb3.md` done (`ui#1643` `bacd033e` pushed); `order-1282-rb3.md` done (`5652d5c5`, carried as step 2); `order-1256-bm.md` done (`1fe710a9`, then batch 2, `ui#1645` pushed); `order-1227-bm.md` done (`ui#1648` `55478fb6` pushed); `#1293` done (`ui#1653`); `#1286` done (`ui#1654`); `#1291` done (`ui#1655`); `#1239`, `#1288`, `#1295` carried (step 8).
- Step 4, `ui#1652` proof and review: done (red on its own head, diagnosed, review batch 1 committed); push carried (step 3).
- Step 5, review batch evidence and proofs: done for `ui#1645` (proof and copy verdict posted) and `ui#1643`; `ui#1632` carried (step 2).
- Step 6, release, Orbit Staging 1.3.73 and sweep: carried (step 9).
- Step 7, launches as slots free: carried (step 10).
- Step 8, Batch R in the spec's order: carried (step 11).

Every identifier here came from a previous session: treat each as a lead to verify.
