/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (the owner's desktop staging report `#1286` to `#1296`, then `#1297` to `#1301`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, `diag1296/`, `diag1637/`, `drafts-1296/`, the decision log) is in the system temporary directory: copy it with a `carry-next31.sh` built from `carry-next30.sh` (set both session ids), link the scratch build worktrees `base`, `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637` and `mc-w1` into the new scratchpad as symlinks (git worktrees in older scratchpads), and refresh `$HOME/.orbit-run-carry/scratchpad` from the new scratchpad with `rsync -a`. Write any helper whose redirect target is a variable with the Write tool: the guardrail refuses a command line with a computed redirect target or a process substitution.

## First: the in-flight work, in this order

1. Launch the `#1297` redesign carry: `order-1297-redesign.md` in `ticket-1297-shell-quote-redesign` (npm ci done) with `--tier mechanical`. When its pull request is green and approved, merge it, run `node tools/complete-ticket.mjs --issue "#1297" --repair-status`, then rerun the failed `Dependency Audit` job on every open redesign pull request (`gh run rerun <run> --failed`). Nothing merges into `redesign/main` before it.
2. `ui#1632`: build `87c6d16f` (`head-build.sh h1632 <sha>`), run `subscreen-start-edge.spec.ts` 25 times and the full layout project, merge `report-1282-rb2.md` (already scrubbed) into the body, reply to and resolve thread `PRRT_kwDOR5Siws6qfe-N` (copy the id from `list-bot-threads.mjs` output), push.
3. Launch the composed review batches: `order-1289-rb1.md` on `ui#1642` (layout red in its own spec and in `label-fit-empty-state.spec.ts`) and `order-1287-rb1.md` on `ui#1643` (the scrollbar decision on `#1287`), both with `--allow-subagents --hard-ceiling-minutes 75 --relaunch-reason`.
4. Launch the prepared tickets: `#1294`, `#1291`, `#1296`, then `#1239`.
5. Drive `ui#1636`, `ui#1639`, `ui#1640`, `ui#1641` (approved, audit red only), then `ui#1634`, `ui#1635`, `ui#1637` (pushed batches, fresh approval needed), then `ui#1645` and `ui#1648` (first review pending) through CI, approval and the combined merge check to merge. Post `ui#1643` and `ui#1645` red-then-green proofs as comments once green.
6. Launch `#1293` after `ui#1634` and `ui#1635` merge, `#1286` after `ui#1634`, `#1288` after `ui#1634` and `ui#1640`, `#1290` after `ui#1648`, `ui#1640` and `#1260`, `#1295` after `ui#1641`, then `#1298` to `#1301`.
7. Release `redesign/main` web to staging, ship Orbit Staging 1.3.72 (131), and sweep it (template `sweep-order-89e5a308.md`, retargeted, one tab in the open window; check `#1284`, `#1236` and `#1261` first).
8. Then Batch R in the spec's order (`### Batch R` and `## Current state`), then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `#1297` `main` side `ui#1644` merged (`edd0e785`); ticket closed by GitHub | redesign carry first, then `--repair-status` |
| `ui#1636` `4ead8013`, `ui#1639` `66cc44ac`, `ui#1640` `edb4187f`, `ui#1641` `0a25b1bf` | approved, 0 threads, audit red only: rerun after the carry, combined check, merge |
| `ui#1637` `79e61bdf` (`#1211`) batch 1 pushed, proven locally | CI, fresh approval, merge |
| `ui#1635` `244c5d56` (`#1285`) batch 3 pushed, thread resolved | CI, fresh approval, merge |
| `ui#1634` `54a9d18d` (`#1258`) batch 2 pushed | CI, fresh approval, merge |
| `ui#1632` (`#1282`) batch 2 committed `87c6d16f`, not pushed; remote head `069398a0` | prove, resolve the P1 thread, push |
| `ui#1642` `e2cd6423` (`#1289`) layout red | launch `order-1289-rb1.md` |
| `ui#1643` `14aed30f` (`#1287`) CI red, approach changed | launch `order-1287-rb1.md` |
| `ui#1645` `dc5e1809` (`#1256`), `ui#1648` `aa14d6bc` (`#1227`) | CI, first review, merge |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch; rerun `Dependency Audit` on the fixed `main` |
| `#1294`, `#1291`, `#1296`, `#1239` prepared, orders composed | launch |
| Staging | API `86e7467c`, web `ecb276bb`, landing `a50de090`, Orbit Staging 1.3.71 (130) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1634` to `ui#1643`, `ui#1645` to `ui#1648`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or the ticket worktrees |
| Unpushed commits | `ticket-1282-subscreen-start-edge` (`87c6d16f`, review batch 2); `ticket-1242-week-grid-one-scroller` (1, `ui#1633` closed into `#1294`, leave it) |
| Branches with no pull request | `ticket-1294`, `ticket-1291`, `ticket-1296`, `ticket-1239`, `ticket-1297-shell-quote-redesign`; older ones in the spec |
| Detached HEADs | scratch build worktrees `base` (`1ce098e5`), `mc-h1637` (`79e61bdf`), `mc-w1`, `mc-h1632`, `mc-h1634`, `mc-h1635`, none with work |
| Running workers, subagents | none |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters; read `gh run list --commit <sha>` before calling a check red; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (worker reports can carry em dashes and machine paths); copy every SHA passed to `--match-head-commit` from this run's output. Run at most six workers while a full layout run or two web builds share the machine. When the relay threshold fires, stop every queued gated launch whose gate has not passed (a queued `gated-launch.sh` launches on its own later).

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (34 open Batch R tickets plus `#1297`'s redesign side, listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 160 open, 160 placed, 0 unplaced, 0 placed twice (`reconcile.mjs`). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried (`carry-next31.sh`, plus the build worktree links).
- Launch `#1297` on `main`, then carry it: `main` done (`ui#1644` merged, `edd0e785`); the carry is carried as step 1 (stopped by the relay drain before launch).
- Launch `order-1285-rb3.md` and `order-1211-rb1.md`: done (`244c5d56` and `79e61bdf` pushed, `ui#1637` proven locally).
- Launch `#1294`, `#1287`, `#1291`, relaunch `#1227`, `#1256`, then `#1239`: `#1287` done (`ui#1643`, now on a review batch), `#1227` done (`ui#1648`), `#1256` done (`ui#1645`); `#1294`, `#1291` and `#1239` carried (stopped by the relay drain).
- Drive `ui#1636`, `ui#1634`, `ui#1632`, `ui#1639`, `ui#1640`, `ui#1641`, `ui#1642` to merge after `#1297`: carried; `ui#1641` took review batch 1 (`0a25b1bf`, approved), `ui#1634` took batch 2, `ui#1632` took batch 2 (unpushed), `ui#1642` needs batch 1.
- Launch `#1296`, then `#1293`, `#1286`, `#1288`, `#1290`, `#1295`, `#1298` to `#1301`: carried (`#1296` prepared).
- Release `redesign/main` web to staging, ship the internal build, sweep: web done (`ecb276bb`, run 37822264507); the internal build and the sweep carried until after the merge batch.
- Batch R in the spec's order: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
