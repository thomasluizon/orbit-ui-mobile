/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (the owner's desktop staging report, now `#1286` to `#1296`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md` (all under that `Decisions/` folder). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: the relay tool nominated you, so `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue of 34 tickets, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor's scratchpad (helpers, orders, notes, proofs, `drafts-owner-1008/`, `diag1637/findings.md`, `repro-reports.md`, the decision log) is in the system temporary directory: copy it with a `carry-next29.sh` built from `carry-next28.sh` (set both session ids; add the directories `drafts-owner-1008`, `diag1637`, `check-w1`, `diag1633`, `diag1635`), and refresh the durable copy at `$HOME/.orbit-run-carry/scratchpad` from it (include `mc-prep.sh` and `mc-check.sh`, which the durable copy once lost because its `mc-*` exclusion matched them).

## First: the in-flight work, in this order

1. Push the proven review batches: `ui#1635` (`5d8a4f39`) and `ui#1634` (`eeea6dd1`); each needs its report in the body, its proof comment, every thread resolved, then the push, a fresh Pullfrog approval and the merge. Then `#1286` launches.
2. `ui#1636`: verify `4ead8013` (three Vitest suites, forced type check), approve the final copy with `/second-opinion` framed as a claimed copy defect, post it, push, merge; then `#1218`, then `#1234`.
3. Launch the owner report tickets that are free: `#1293`, `#1287`, `#1289`, `#1291`, `#1292`, `#1294`, `#1296` (`#1294` with an overlap note: `#1288` owns the period header). Then `#1286`, `#1288`, `#1290`, `#1295` as their blockers land.
4. `ui#1637`: compose and launch review batch 1 from `diag1637/findings.md` (the evident-cut resolver and the `DESIGN.md` peek sentence, a decision already taken and recorded in the spec).
5. Relaunch `#1227`, `#1241` and `#1256` on their committed trees with `--relaunch-reason` to verify, push and open their pull requests; `#1239` when the open pull request cap allows.
6. `ui#1632`: prove `069398a0` (25 runs, full layout), push, merge. Close `ui#1633` into `#1294`. Drive `ui#1639` (`#1237`) to merge.
7. Delete "Sweep caminhar devagar..." and "Sweep fumar" from the owner's staging account through the app in a new tab of the open Chrome window, and confirm "Sweep-Supercalifragilisticexpialidocious-Token-Habit" is gone.
8. Release `redesign/main` web to staging (three merges ahead of `89e5a308`), ship Orbit Staging 1.3.72 (131), and sweep after it (template `sweep-order-89e5a308.md`, retargeted; its Chrome rule now says one tab in the open window).
9. Then Batch R in the spec's order (`### Batch R` and `## Current state`), launching every ticket `overlap-matrix.sh` shows free, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1636` remote `be700346`, unpushed `d6b2623b`, `4ead8013` (`#1217`) | verify, copy approval, push, merge |
| `ui#1635` remote `738461ad`, unpushed `5d8a4f39` proven (`#1285`) | body, resolve, push, merge |
| `ui#1634` remote `9658f14e`, unpushed `eeea6dd1` proven (`#1258`) | body, resolve P3 thread, push, merge |
| `ui#1632` remote `15d02ae0`, unpushed `069398a0` (`#1282`) | prove 25 runs and full layout, push, merge |
| `ui#1637` `e9b9fb4d` (`#1211`) | review batch 1 from `diag1637/findings.md` |
| `ui#1633` `297ed17a` (`#1242`) | close into `#1294` |
| `ui#1639` `66cc44ac` (`#1237`) | CI and review, merge |
| `ui#1638` (main, dependabot) | later batch; Dependency Audit red |
| `#1227` 3 commits, `#1241` 3 commits, `#1256` 2 commits plus 9 staged paths, no pull requests | relaunch to finish |
| `#1239` prepared on `1ce098e5` | launch when the cap allows |
| `#1286` to `#1296` filed, not started | launch first, per the order above |
| Merged this session | `ui#1630` (`76e1aa44`, `#1284`), `ui#1627` (`55aed049`, `#1236`), `ui#1625` (`3a2da7db`, `#1261`); all three tickets closed |
| Staging | API `86e7467c`, web `89e5a308`, landing `a50de090`, Orbit Staging 1.3.71 (130) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1632` to `ui#1639`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work in the three checkouts | none; the only uncommitted worker output is `#1256`'s 9 staged paths |
| Unpushed commits | `ticket-1217` (2), `ticket-1285` (1), `ticket-1258` (1), `ticket-1282` (1), `ticket-1227` (3), `ticket-1241` (3), `ticket-1256` (2) |
| Branches with no pull request | `ticket-1227`, `ticket-1241`, `ticket-1256`, `ticket-1239`; older ones listed in the spec |
| Detached HEADs | scratch build worktrees `base`, `mc-w1`, `mc-h1634`, `mc-h1635`, `mc-h1637` in the predecessor scratchpad, none with work |
| Running workers, subagents | none |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail of the previous prompt: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters; read `gh run list --commit <sha>` before calling a check red; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. Run at most six workers while a full layout run or two web builds share the machine.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (30 open Batch R tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 156 open, 156 placed, 0 unplaced, 0 placed twice (`reconcile.mjs`). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Maximum velocity, Sleep, the authorization paragraph and owner instructions 1 to 12: carried (condensed above; the spec's standing rules hold the rest).
- Entry point with `adoptRelayRun` false: superseded; this is a relay, so it returns true.
- Restore the scratchpad from the durable copy: done this session; carried as the carry step above.
- The owner's staging reports 1 to 11: done as tickets `#1286` to `#1296` (one per root cause); the fixes are carried.
- Delete the sweep test habits: one deleted, two carried.
- `ui#1630`, `ui#1627`, `ui#1625`: done (merged, closed).
- `ui#1637`: diagnosis done; review batch carried. `ui#1635`, `ui#1634`: proofs done; pushes carried. `ui#1636`: batches 2 and 3 done; verification and push carried. `ui#1633`: superseded by `#1294`. `ui#1632`: batch 1 done; proof carried.
- `#1237` relaunch: done (`ui#1639`). `#1227`, `#1241`, `#1256`: relaunched, ceilings hit with commits; carried. `#1239`: carried.
- Release, staging build and sweep after each merge batch: carried (owed for `3a2da7db`).
- New owner rule this session: Chrome work stays in one tab of the open window, no new windows (now a standing rule in the spec).

Every identifier here came from a previous session: treat each as a lead to verify.
