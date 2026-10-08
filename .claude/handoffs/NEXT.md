/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (the owner's desktop staging report `#1286` to `#1296`, then `#1297` to `#1302`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, `diag1645/`, `drafts-c9b8/`, `check-w2/`, the decision log) is in the system temporary directory: copy it with a `carry-next32.sh` built from `carry-next31.sh` (set both session ids, add `diag1645`, `drafts-c9b8` and `check-w2` to the directory list), link the scratch build worktrees `base`, `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637`, `mc-w1`, `mc-w2`, `mc-h1642` and `mc-h1643` into the new scratchpad as symlinks (git worktrees in older scratchpads), and refresh `$HOME/.orbit-run-carry/scratchpad` from the new scratchpad with `rsync -a`. Write any helper whose redirect target is a variable with the Write tool: the guardrail refuses a command line with a computed redirect target or a process substitution.

## First: the in-flight work, in this order

1. Read the local proofs the predecessor left running (their processes may have died with it; rerun any that did not finish): `check-w2/summary.txt` (combined check A), `chain-1632diag.sh` (`rep-1632todayhead.log`, `rep-1632todaybase.log`), `chain-1642rb1.sh` (`red-1642goals.log`, `red-1642labelfit.log`, `rep-1642goals.log`, `rep-1642labelfit.log`), `chain-1643rb2.sh` (`red-1643rb2.log`, `rep-1643rb2.log`, `layout-1643rb2.log`). Kill any leftover listeners on ports 5099 and 3000 before a new layout run.
2. `ui#1649` (`#1297` carry, `cb04f39d`, approved): its only red is `Expo SDK Pin` (Expo published SDK 57 patch releases; `expo install --check` fails on any manifest change). File that drift as its own ticket, bump the Expo patch set on `main` first, carry it, and decide whether `ui#1649` waits for it; log the decision. Once `ui#1649` merges: `node tools/complete-ticket.mjs --issue "#1297" --repair-status`, then `gh run rerun <run> --failed` for the `Dependency Audit` job on every open redesign pull request.
3. Merge batch A (`ui#1636`, `ui#1639`, `ui#1640`, `ui#1641`, `ui#1634`, `ui#1635`) on combined check A, each with `--match-head-commit` copied from this run's output, then close each ticket with `complete-ticket.mjs`.
4. Push the proven review batches: `ui#1642` (`a57cdc3d`), `ui#1643` (`cbb10f7b`), and `ui#1632` (`87c6d16f`) only after its `today-rows-layout.spec.ts` diagnosis: a head-only red means review batch 3 (the profile language reload must not land after content renders). Post the red-then-green proofs as comments, merge each worker report into the body, resolve `ui#1632`'s P1 thread, fresh approval for each.
5. Send mechanical base-merge orders after batch A: `ui#1637` (keep both `CLAUDE.md` row additions), `ui#1645` (on top of `fbeb849c`; then run `label-fit-typed-text-slots.spec.ts` on its build and approve the `common.showFullText` copy with `/second-opinion`), `ui#1648`.
6. Launch the prepared tickets as slots free (recompose after the fast-forward): `#1294`, `#1291`, `#1296`, then `#1239`. Then `#1293` after `ui#1634` and `ui#1635`, `#1286` after `ui#1634`, `#1288` after `ui#1634` and `ui#1640`, `#1290` after `ui#1648`, `ui#1640` and `#1260`, `#1295` after `ui#1641`, then `#1298` to `#1302`.
7. Release `redesign/main` web to staging, ship Orbit Staging 1.3.72 (131), and sweep it (template `sweep-order-89e5a308.md`, retargeted, one tab in the open window; check `#1284`, `#1236` and `#1261` first).
8. Then Batch R in the spec's order (`### Batch R` and `## Current state`), then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1649` `cb04f39d` (`#1297` carry) | approved; `Expo SDK Pin` red from upstream Expo patch drift; file, fix on `main`, carry, merge |
| `ui#1636` `4ead8013`, `ui#1639` `66cc44ac`, `ui#1640` `edb4187f`, `ui#1641` `0a25b1bf`, `ui#1634` `54a9d18d`, `ui#1635` `244c5d56` | approved, 0 threads, green except `Dependency Audit`; combined check A (`check-w2`) passed all steps through the web build, layout pending; merge after `ui#1649` |
| `ui#1637` `79e61bdf` | approved; conflicts with `ui#1641` on `CLAUDE.md`; base merge after batch A |
| `ui#1645` `dc5e1809`, batch 1 `fbeb849c` unpushed | own spec red in CI, batch fixes it; conflicts with `ui#1636`, `ui#1635`; base merge on top, prove, copy approval, push |
| `ui#1648` `aa14d6bc` | approved, green except audit; conflicts with `ui#1640`; base merge after batch A |
| `ui#1632` remote `069398a0`, batch 2 `87c6d16f` unpushed | spec 601 of 601, full layout 1,416 of 1,422 (5 `#1296` base reds, 1 `today-rows-layout` navigation red under diagnosis) |
| `ui#1642` remote `e2cd6423`, batch 1 `a57cdc3d` unpushed | proof chain started; push after it is green |
| `ui#1643` remote `14aed30f`, batches `765b02f5` and `cbb10f7b` unpushed | proof chain started (red on base, 5 repeats, full layout); push after it is green |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch; no Pullfrog approval posts on them |
| `#1294`, `#1291`, `#1296`, `#1239` prepared, orders composed | launch as slots free |
| `#1302` filed (login focus flake, `redesign/main`) | queued after `#1298` to `#1301` |
| Staging | API `86e7467c`, web `ecb276bb`, landing `a50de090`, Orbit Staging 1.3.71 (130) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1634` to `ui#1643`, `ui#1645` to `ui#1649`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or the ticket worktrees |
| Unpushed commits | `ticket-1282-subscreen-start-edge` (`87c6d16f`), `ticket-1289-progresso-goals-empty` (`a57cdc3d`), `ticket-1287-shell-scrollbar` (`765b02f5`, `cbb10f7b`), `ticket-1256-typed-text-slots` (`fbeb849c`), `ticket-1242-week-grid-one-scroller` (1, `ui#1633` closed into `#1294`, leave it) |
| Branches with no pull request | `ticket-1294`, `ticket-1291`, `ticket-1296`, `ticket-1239`; older ones in the spec |
| Detached HEADs | scratch build worktrees `base` (`1ce098e5`), `mc-w2` (combined `16411091`), `mc-h1632` (`87c6d16f`), `mc-h1642`, `mc-h1643`, `mc-h1634`, `mc-h1635`, `mc-h1637`, `mc-w1`, none with work |
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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (35 open Batch R tickets plus `#1297`'s redesign side, listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 161 open, 161 placed, 0 unplaced, 0 placed twice (`reconcile.mjs`). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried (`carry-next32.sh`, plus the build worktree links).
- Launch the `#1297` redesign carry, merge, repair status, rerun audits: launch done (`ui#1649`, `cb04f39d`, approved); merge, repair and reruns carried (step 2), now gated on the `Expo SDK Pin` drift.
- `ui#1632`: build `87c6d16f`, spec 25 times, full layout, body merge, thread, push: build and both runs done (601 of 601; 1,416 of 1,422); the `today-rows-layout` diagnosis, body merge, thread and push carried (step 4).
- Launch `order-1289-rb1.md` on `ui#1642` and `order-1287-rb1.md` on `ui#1643`: done (`a57cdc3d`; `765b02f5`, then batch 2 `cbb10f7b`); proofs and pushes carried (step 4).
- Launch `#1294`, `#1291`, `#1296`, `#1239`: carried (step 6; admission sat at the 16 open pull request cap).
- Drive `ui#1636`, `ui#1639`, `ui#1640`, `ui#1641`, `ui#1634`, `ui#1635`, `ui#1637`, `ui#1645`, `ui#1648` to merge; post `ui#1643` and `ui#1645` proofs: batch A of six carried (step 3, combined check A run); `ui#1637`, `ui#1645`, `ui#1648` carried as base merges (step 5); `ui#1645` took review batch 1 (`fbeb849c`); proofs carried.
- Launch `#1293`, `#1286`, `#1288`, `#1290`, `#1295`, `#1298` to `#1301`: carried (step 6, with `#1302` added).
- Release web to staging, ship Orbit Staging 1.3.72 (131), sweep: carried (step 7).
- Batch R in the spec's order: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
