/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (the owner's desktop staging report `#1286` to `#1296`, then `#1297` to `#1301`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue of 39 tickets, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, proofs, `diag1296/`, `diag1637/`, `drafts-1296/`, the decision log) is in the system temporary directory: copy it with a `carry-next30.sh` built from `carry-next29.sh` (set both session ids; add the directories `diag1296`, `drafts-1296`, `suites-v1217`), link the scratch build worktrees `base`, `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637` and `mc-w1` into the new scratchpad as symlinks (they live in an older scratchpad and are git worktrees), and refresh `$HOME/.orbit-run-carry/scratchpad` from the new scratchpad with `rsync -a`. Helpers whose redirect targets are variables must be script files: the guardrail refuses a command line with a computed redirect target.

## First: the in-flight work, in this order

1. Launch `#1297` (the critical `shell-quote` advisory that fails `Dependency Audit` on every pull request) on `main`, then carry it to `redesign/main` (`#556` or a paired pull request). Nothing merges until it lands.
2. Launch the composed review batches: `order-1285-rb3.md` on `ui#1635` (the query-edit selection paint) and `order-1211-rb1.md` on `ui#1637` (the evident-cut resolver, the spec edits, `DESIGN.md:787`, SonarCloud coverage). Each needs its layout proof before its push.
3. Launch the prepared tickets: `#1294`, `#1287`, `#1291` (worktrees, npm ci and orders ready), then relaunch `#1227` and `#1256` with `--relaunch-reason` (orders carry the resume note), then `#1239`.
4. Drive `ui#1636`, `ui#1634`, `ui#1632`, `ui#1639`, `ui#1640`, `ui#1641`, `ui#1642` through CI, fresh approvals and D115 checks to merge once `#1297` is in `redesign/main`.
5. Launch `#1296` (spec-only, from its decision comment), then `#1293` after `ui#1634` and `ui#1635` merge, `#1286` after `ui#1634`, `#1288` after `ui#1634` and `ui#1640`, `#1290` after `#1227`, `ui#1640` and `#1260`, `#1295` after `ui#1641`, then `#1298` to `#1301`.
6. Release `redesign/main` web to staging, ship the next Orbit Staging internal build, and sweep it (template `sweep-order-89e5a308.md`, retargeted, one tab in the open window; a staging tab is already open there).
7. Then Batch R in the spec's order (`### Batch R` and `## Current state`), launching every ticket `overlap-matrix.sh` shows free, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1636` `4ead8013` (`#1217`) pushed, verified, copy approved | approval, D115 check, merge after `#1297` |
| `ui#1635` `5d8a4f39` (`#1285`) pushed, Pullfrog P2 open | launch `order-1285-rb3.md`, prove, resolve, push |
| `ui#1634` `e1613a2e` (`#1258`) base merge plus manifest pushed | CI, approval, merge |
| `ui#1632` `069398a0` (`#1282`) pushed and proven | approval, D115 check, merge |
| `ui#1637` `e9b9fb4d` (`#1211`) Layout Guard and SonarCloud red | launch `order-1211-rb1.md` |
| `ui#1639` `66cc44ac` (`#1237`) approved | merge after `#1297` |
| `ui#1640` `edb4187f` (`#1241`), `ui#1641` `0a84f861` (`#1292`), `ui#1642` `e2cd6423` (`#1289`) | CI and first review, then merge |
| `ui#1638` (`main`, dependabot) | later batch; red on `Dependency Audit` |
| `ui#1633` | closed into `#1294` |
| `#1227` 3 commits, `#1256` 2 commits plus 9 staged paths, no pull requests | relaunch to finish |
| `#1294`, `#1287`, `#1291` prepared, refused by the relay drain | launch |
| `#1239` prepared on `1ce098e5` | launch when the cap allows |
| `#1297` to `#1301` filed this session, not started | launch per the order above |
| Staging | API `86e7467c`, web `89e5a308`, landing `a50de090`, Orbit Staging 1.3.71 (130) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1634` to `ui#1642`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work in the three checkouts | none; the only uncommitted worker output is `#1256`'s 9 staged paths |
| Unpushed commits | `ticket-1227` (3), `ticket-1256` (2) |
| Branches with no pull request | `ticket-1227`, `ticket-1256`, `ticket-1239`, `ticket-1294`, `ticket-1287`, `ticket-1291`; older ones in the spec |
| Detached HEADs | scratch build worktrees `base`, `mc-w1`, `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637`, none with work |
| Running workers, subagents | none |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters; read `gh run list --commit <sha>` before calling a check red; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (worker reports can carry em dashes); copy every SHA passed to `--match-head-commit` from this run's output. Run at most six workers while a full layout run or two web builds share the machine.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (35 open Batch R tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 161 open, 161 placed, 0 unplaced (`reconcile.mjs`). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried (`carry-next30.sh`, plus the build worktree links).
- Push `ui#1635` and `ui#1634`: done (`5d8a4f39` and `eeea6dd1` pushed with proofs); `ui#1634` also took a base merge and the regenerated manifest (`e1613a2e`); their merges carried, behind `#1297`.
- `ui#1636`: verified, copy approved, pushed (`4ead8013`); merge carried; `#1218` then `#1234` carried.
- Launch the owner report tickets: `#1292` and `#1289` done (`ui#1641`, `ui#1642`); `#1294`, `#1287`, `#1291` prepared and carried; `#1293` carried (waits for `ui#1634` and `ui#1635`); `#1296` diagnosed (spec-only) and carried; `#1286`, `#1288`, `#1290`, `#1295` carried.
- `ui#1637` review batch 1: composed (`order-1211-rb1.md`), launch carried (the relay drain refused launches).
- Relaunch `#1227`, `#1241`, `#1256`: `#1241` done (`ui#1640`); `#1227` and `#1256` carried; `#1239` carried.
- `ui#1632` proof and push: done; merge carried. Close `ui#1633`: done. `ui#1639`: approved, merge carried behind `#1297`.
- Delete the sweep test habits: done (search for "Sweep" finds nothing).
- Release, staging build and sweep: carried.
- Batch R in the spec's order: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
