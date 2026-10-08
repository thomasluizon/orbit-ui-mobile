/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (the owner's desktop staging report `#1286` to `#1296`, then `#1298` to `#1304`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, merged bodies, the diagnosis files, the decision log) is in the system temporary directory: copy it with `carry-next34.sh` from that scratchpad (set `NEW_ID` to this session's id; it links the build worktrees `base`, `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637`, `mc-w1`, `mc-w2`, `mc-w3`, `mc-h1642`, `mc-h1643` as symlinks), and refresh `$HOME/.orbit-run-carry/scratchpad` from the new scratchpad with `rsync -a --exclude 'mc-*' --exclude base`. Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad: the guardrail refuses a computed redirect target or a process substitution.

## First: the in-flight work, in this order

1. Launch the four prepared tickets, gated, about 90 seconds apart: `#1296` first (spec-only), then `#1294`, `#1291`, `#1239`. For each: fast-forward the main checkout, `git merge --ff-only origin/redesign/main` in its worktree (none holds commits of its own), `npm ci` there (`ui#1649` changed the lockfile), recompose with `recompose.sh <issue> <worktree name>`, then `gated-launch.sh` with `--allow-subagents --hard-ceiling-minutes 75`. Nine pull requests are open against the cap of 16.
2. `ui#1632` review batch 3: `compose-rb.sh 1282 ticket-1282-subscreen-start-edge rb3` (it appends `note-1282-rb3.md`: keep the profile read enabled, keep the write guards, restore the two GET assertions, check the Android mirror), launch gated with `--allow-subagents --hard-ceiling-minutes 75` (add `--relaunch-reason` if the launcher refuses). When it reports, build the head, run `calendar-header-every-view.spec.ts` and `subscreen-start-edge.spec.ts` on it, carry the report into the body, push, fresh approval, D115 check, merge.
3. Base merges on `4e12d55b`, one gated launch each: `compose-rb.sh 1211 ticket-1211-suggestion-chip-hug bm` (`ui#1637`), `compose-rb.sh 1256 ticket-1256-typed-text-slots bm` (`ui#1645`, on top of the unpushed `fbeb849c`; prove `label-fit-typed-text-slots.spec.ts` red on the base build and green on its build; post the `/second-opinion` copy verdict from `so-1645-copy.json` before the push), `compose-rb.sh 1227 ticket-1227-switch-label-centre bm` (`ui#1648`). Prove, push, fresh approval, merge.
4. `ui#1642` (`a57cdc3d`, approved, 0 threads): D115 check of `redesign/main` plus this head (forced type check, the CVE gate, the three Vitest suites, the web build, its two layout specs), then merge with `--match-head-commit` copied from this run's output, then `complete-ticket.mjs --issue "#1289"`.
5. `ui#1643` (`5b735558`, approved, 0 threads): its Layout Guard rerun was running at the relay (a first-time `calendar-agenda-time-tone.spec.ts` 1280 light failure; if it fails again, file the race at its root). When green, D115 check on the new base including the layout project (global scrollbar CSS), merge, `complete-ticket.mjs --issue "#1287"`.
6. Release `redesign/main` web to staging (batch A and the carry are merged), ship Orbit Staging 1.3.72 (131), and sweep it with `sweep-order-ecb276bb.md` retargeted at the released commit (it checks `#1284`, `#1236` and `#1261` first; add batch A's six fixes). The session has no `claude-in-chrome` tab group and creating one opens a forbidden new window: use the method in the spec's constraint on sweeps (an `orca computer` tab in the open window with DevTools docked), only while the owner is not using that window.
7. Launch as slots free: `#1293`, `#1286`, `#1288`, `#1295`, then `#1290` (after `ui#1648` and `#1260`), then `#1298` to `#1302`, and `#1304` on `main` when no UI ticket can launch.
8. Then Batch R in the spec's order (`### Batch R` and `## Current state`), then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1632` `87c6d16f` (`#1282`) | approved, 0 threads, HELD: Layout Guard red from its delayed profile read; review batch 3 note ready (step 2) |
| `ui#1642` `a57cdc3d` (`#1289`) | approved, 0 threads, proof posted, green except the stale `Dependency Audit`; D115 check, merge (step 4) |
| `ui#1643` `5b735558` (`#1287`) | approved, 0 threads, proof posted; Layout Guard rerun running at the relay (step 5) |
| `ui#1637` `79e61bdf`, `ui#1648` `aa14d6bc` | approved; base merge on `4e12d55b` (step 3) |
| `ui#1645` `dc5e1809`, batch 1 `fbeb849c` unpushed | copy approved; base merge on top of `fbeb849c` (step 3) |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch; no Pullfrog approval posts on them |
| `#1296`, `#1294`, `#1291`, `#1239` | prepared, orders composed on an older base; refresh and launch (step 1) |
| Merged this session | `ui#1650` (`main` `445639e2`, `#1303`), `ui#1649` (`6fa56ca1`, `#1297` carry plus `#1303`), batch A `ui#1636`, `ui#1639`, `ui#1640`, `ui#1641`, `ui#1634`, `ui#1635` (`redesign/main` `4e12d55b`); tickets `#1297`, `#1303`, `#1217`, `#1237`, `#1241`, `#1292`, `#1258`, `#1285` closed |
| Filed this session | `#1304` (the Android build gate fails on a corrupt NDK download; harness, `main`) |
| Staging | API `86e7467c`, web `ecb276bb` (behind `redesign/main` by the carry and batch A), landing `a50de090`, Orbit Staging 1.3.71 (130) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; `main` has unreleased `edd0e785` and `445639e2` |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1637`, `ui#1638`, `ui#1642`, `ui#1643`, `ui#1645` to `ui#1648`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or the ticket worktrees |
| Unpushed commits | `ticket-1256-typed-text-slots` (`fbeb849c`), `ticket-1242-week-grid-one-scroller` (1, `ui#1633` closed into `#1294`, leave it) |
| Branches with no pull request | `ticket-1294`, `ticket-1291`, `ticket-1296`, `ticket-1239`; older ones in the spec |
| Detached HEADs | scratch build worktrees `base` (`1ce098e5`), `mc-w2`, `mc-w3` (combined `7ee3f12a`), `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637`, `mc-w1`, `mc-h1642`, `mc-h1643`; none with work |
| Running workers, subagents | none; the `ui#1643` CI waiter ends with this session |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (worker reports can carry em dashes and machine paths; `extract-final.sh` scrubs them); copy every SHA passed to `--match-head-commit` from this run's output. Run at most six workers while a full layout run or two web builds share the machine. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. When the relay threshold fires, stop every queued gated launch whose gate has not passed.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (29 open Batch R tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 156 open, 156 placed, 0 unplaced, 0 placed twice (`reconcile.mjs`; the one new placement is `#1304`, in one Batch R bullet). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried (now `carry-next34.sh`).
- Step 1, merge `ui#1650`: done (`445639e2`).
- Step 2, carry `#1303` into `ui#1649`, merge, repair `#1297` and `#1303`, rerun `Dependency Audit`: merge and repairs done (`6fa56ca1`); the audit reruns superseded (a rerun reuses the old merge commit and fails again; the D115 merge-result check replaces it, now a standing rule).
- Step 3, merge batch A on combined check A: done on checks A and W3, six tickets closed.
- Step 4, proofs and pushes for `ui#1642`, `ui#1643`, `ui#1632`: `ui#1642` and `ui#1643` done (pushed with proofs, approved); `ui#1632` superseded by its review batch 3 (step 2), after the diagnosis found its delayed profile read.
- Step 5, base merges for `ui#1637`, `ui#1645`, `ui#1648`: carried (step 3), notes written.
- Step 6, launches: carried (steps 1 and 7); `#1296` moved first.
- Step 7, release, Orbit Staging 1.3.72 and sweep: carried (step 6).
- Step 8, Batch R in the spec's order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
