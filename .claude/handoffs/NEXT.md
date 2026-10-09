/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (the owner's desktop staging report `#1286` to `#1296`, then `#1298` to `#1304`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, the diagnosis files, the decision log) is in the system temporary directory: copy it with `carry-next35.sh` from that scratchpad (set `NEW_ID` to this session's id; it links the build worktrees `base`, `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637`, `mc-w1`, `mc-w2`, `mc-w3`, `mc-h1642`, `mc-h1643`, `mc-m1642`, `mc-d1651`, `mc-b1637` as symlinks), and refresh `$HOME/.orbit-run-carry/scratchpad` from the new scratchpad with `rsync -a --exclude 'mc-*' --exclude base`. Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad: the guardrail refuses a computed redirect target or a process substitution.

## First: the in-flight work, in this order

1. `ui#1651` (`#1296`, `fcf4c6f8`, approved, proven 48 of 48 under the delayed profile read, proof posted): confirm the approval came after the head's first pull_request run and CI is green, merge with `--match-head-commit` copied from this run's output, then `complete-ticket.mjs --issue "#1296"`.
2. `ui#1637` (`#1211`, base merge `716cf160` pushed after its proof): fresh Pullfrog approval of `716cf160`, green CI, merge, `complete-ticket.mjs --issue "#1211"`.
3. Launch, gated, about 90 seconds apart, with `--allow-subagents --hard-ceiling-minutes 75` (add `--relaunch-reason` when the launcher refuses): `order-1287-rb3.md` (`ui#1643`, worktree `ticket-1287-shell-scrollbar`), `order-1282-rb3.md` (`ui#1632`), `order-1256-bm.md` (`ui#1645`), `order-1227-bm.md` (`ui#1648`), then the prepared tickets `#1293`, `#1286`, `#1291`, `#1239`, `#1288`, `#1295` (orders `order-<n>.md`, worktrees on `1684ecee` with `npm ci` done). Before each, refresh its overlap note when a pull request it names has merged (`overlap-now.sh`, `overlap-note.sh`, `recompose.sh`). Run at most six workers while a full layout run or two web builds share the machine.
4. `ui#1652` (`#1294`, `64e10a32`): build the base and the head, prove its new layout specs red on the base and green on the head, check every colour, size and shape it adds against `DESIGN.md`, read its diff for gate edits, then CI and review.
5. Each review batch that reports: carry its evidence into the body, prove the named specs (for `ui#1645`, `label-fit-typed-text-slots.spec.ts` red on the base build and green on its build, and post the `/second-opinion` copy verdict from `so-1645-copy.json` before the push; for `ui#1632`, `calendar-header-every-view.spec.ts` and `subscreen-start-edge.spec.ts`; for `ui#1643`, its D115 check includes the layout project), push once, fresh approval, D115 check, merge, complete the ticket.
6. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit (its `orca computer` method, a new tab in the open window with DevTools docked, only while the owner is idle; everything the `1684ecee` sweep did not reach is owed). Verify the 544 versus 580 content edge lead in `## Current state` before filing.
7. Launch as slots free: `#1290` (after `ui#1648` and `#1260`), then `#1298` to `#1302`, and `#1304` on `main` when no UI ticket can launch.
8. Then Batch R in the spec's order (`### Batch R` and `## Current state`), then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1651` `fcf4c6f8` (`#1296`) | approved, proven, CI pending at the relay; merge (step 1) |
| `ui#1637` `716cf160` (`#1211`) | base merge pushed after proof; needs a fresh approval (step 2) |
| `ui#1652` `64e10a32` (`#1294`) | opened by the worker, unreviewed; prove and review (step 4) |
| `ui#1643` `5b735558` (`#1287`) | approved, HELD: its own test's Linux red is a test defect (viewport meta), `order-1287-rb3.md` composed (step 3) |
| `ui#1632` `87c6d16f` (`#1282`) | approved, HELD: `order-1282-rb3.md` composed (step 3) |
| `ui#1645` `dc5e1809` plus unpushed `fbeb849c`, `ui#1648` `aa14d6bc` | approved; base merge orders composed (step 3) |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch; no Pullfrog approval posts on them |
| `#1291`, `#1239`, `#1293`, `#1286`, `#1288`, `#1295` | prepared, not launched; the relay stopped their gated launches before their gates passed (step 3) |
| Merged this session | `ui#1642` (`#1289`, `852c3de5`), ticket `#1289` closed; merged worktrees of `#1289`, batch A, `#1297`, `#1303` torn down |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; `main` has unreleased `edd0e785` and `445639e2` |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1637`, `ui#1638`, `ui#1643`, `ui#1645` to `ui#1648`, `ui#1651`, `ui#1652`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the checkouts or the ticket worktrees |
| Unpushed commits | `ticket-1256-typed-text-slots` (`fbeb849c`), `ticket-1242-week-grid-one-scroller` (1, `ui#1633` closed into `#1294`, leave it) |
| Branches with no pull request | `ticket-1291`, `ticket-1239`, `ticket-1293`, `ticket-1286`, `ticket-1288`, `ticket-1295`; older ones in the spec |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Running workers, subagents | none; the CI waiters on `ui#1637`, `ui#1643` and `ui#1651` end with this session |
| Owner side effect | the sweep left its tab and docked DevTools in the owner's Chrome window when he came back; he was told to close them (Command+Option+I, Command+W); if a "SWEEP" tab is still open while he is idle, close it |
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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (28 open Batch R tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 155 open, 155 placed, 0 unplaced (`reconcile.mjs`); no ticket was added to the order this session, so placed twice stays 0 as last counted. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried (now `carry-next35.sh`).
- Step 1, launch `#1296`, `#1294`, `#1291`, `#1239`: `#1296` done (`ui#1651`), `#1294` done (`ui#1652`); `#1291` and `#1239` carried (step 3), their gated launches stopped by the relay.
- Step 2, `ui#1632` review batch 3: carried (step 3), composed, launch stopped by the relay.
- Step 3, base merges: `ui#1637` done (`716cf160` pushed after proof, step 2); `ui#1645` and `ui#1648` carried (step 3).
- Step 4, D115 check and merge of `ui#1642`: done (`852c3de5`, `#1289` closed).
- Step 5, `ui#1643` Layout Guard and merge: superseded by its own Unit Tests red, diagnosed as a test defect; review batch 3 carried (step 3).
- Step 6, release, Orbit Staging 1.3.72 and sweep: release and build done (web `1684ecee`, 1.3.72 (131) uploaded); the sweep ran partially (600 dark) and the rest is carried (step 6).
- Step 7, launches as slots free: `#1293` and `#1286` prepared and carried (step 3); `#1288` and `#1295` prepared and carried; `#1290`, `#1298` to `#1302` and `#1304` carried (step 7).
- Step 8, Batch R in the spec's order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
