/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (the owner's desktop staging report `#1286` to `#1296`, then `#1297` to `#1303`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay: `adoptRelayRun` returns true and has already written the inherited run (its `remaining` queue, `pullRequests`, `readinessLedger`) with `sleep: true`. Read it back and continue; do not replan the queue. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, merged bodies, `drafts-a801/`, the decision log) is in the system temporary directory: copy it with `carry-next33.sh` from that scratchpad (set `NEW_ID` to this session's id; it already links the build worktrees `base`, `mc-h1632`, `mc-h1634`, `mc-h1635`, `mc-h1637`, `mc-w1`, `mc-w2` as symlinks, and `mc-h1642`, `mc-h1643` once the chains create them), and refresh `$HOME/.orbit-run-carry/scratchpad` from the new scratchpad with `rsync -a --exclude 'mc-*' --exclude base`. Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad: the guardrail refuses a computed redirect target or a process substitution.

## First: the in-flight work, in this order

1. `ui#1650` (`#1303`, `main`, `ac81052b`): CI was running at the relay. When it is green with a Pullfrog approval of that head and zero threads, merge it with `gh pr merge --squash --match-head-commit` copied from this run's output.
2. `ui#1649` (`#1297` carry): copy `note-1297-carry2.md`, replace `__MAIN_SHA__` with `ui#1650`'s squash commit, compose a mechanical `--review-batch` order for `#1297` on worktree `ticket-1297-shell-quote-redesign` (branch `fix/ticket-1297-shell-quote-redesign`, base `redesign/main`) with the note appended, launch it gated, push its cherry-pick, wait for green and a fresh approval, merge. Then `node tools/complete-ticket.mjs --issue "#1297" --repair-status` and the same for `#1303`, then `gh run rerun <run> --failed` for `Dependency Audit` on every open redesign pull request.
3. Merge batch A (`ui#1636`, `ui#1639`, `ui#1640`, `ui#1641`, `ui#1634`, `ui#1635`) on combined check A (complete, every step exit 0), each with `--match-head-commit` copied from this run's output after its audit rerun is green, then close each ticket with `complete-ticket.mjs`.
4. Proofs and pushes: `ui#1642` (`a57cdc3d`): read `proofs-1642.out` and its logs (rerun `chain-1642rb1.sh` if incomplete), post red-then-green, apply `body-1642rb1-merged.md`, push. `ui#1643` (`cbb10f7b`): run `chain-1643rb2.sh` (it ends with the full layout project), post red-then-green, apply `body-1643rb2-merged.md`, push. `ui#1632` (`87c6d16f`, pushed): wait for CI and a fresh approval, then merge after batch A on a D115 check. Kill leftover listeners on ports 5099 and 3000 before a layout run.
5. Mechanical base-merge orders after batch A: `ui#1637` (keep both `CLAUDE.md` row additions), `ui#1645` (on top of `fbeb849c`; run `label-fit-typed-text-slots.spec.ts` on its build; post the approved copy verdict from `so-1645-copy.json`), `ui#1648`.
6. Launch the prepared tickets as admission frees slots (recompose after fast-forwarding the main checkout): `#1294`, `#1291`, `#1296`, then `#1239`. Then `#1293` after `ui#1634` and `ui#1635`, `#1286` after `ui#1634`, `#1288` after `ui#1634` and `ui#1640`, `#1290` after `ui#1648`, `ui#1640` and `#1260`, `#1295` after `ui#1641`, then `#1298` to `#1302`.
7. Release `redesign/main` web to staging, ship Orbit Staging 1.3.72 (131), and sweep it with `sweep-order-ecb276bb.md` retargeted at the released commit (it checks `#1284`, `#1236` and `#1261` first). The session has no `claude-in-chrome` tab group and creating one opens a forbidden new window: use the method in the spec's constraint on sweeps (an `orca computer` tab in the open window with DevTools docked), only while the owner is not using that window.
8. Then Batch R in the spec's order (`### Batch R` and `## Current state`), then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1650` `ac81052b` (`#1303`, `main`) | CI running, waiter started; merge on the bar |
| `ui#1649` `cb04f39d` (`#1297` carry) | approved; `Expo SDK Pin` red until it carries `ui#1650`'s squash commit (step 2) |
| `ui#1636` `4ead8013`, `ui#1639` `66cc44ac`, `ui#1640` `edb4187f`, `ui#1641` `0a25b1bf`, `ui#1634` `54a9d18d`, `ui#1635` `244c5d56` | approved, 0 threads, green except `Dependency Audit`; combined check A passed every step; merge after `ui#1649` |
| `ui#1632` `87c6d16f` (pushed) | P1 thread resolved, body updated, waiter started; needs fresh approval; merge after batch A |
| `ui#1642` remote `e2cd6423`, batch 1 `a57cdc3d` unpushed | proof chain was running; push after it is green |
| `ui#1643` remote `14aed30f`, batches `765b02f5` and `cbb10f7b` unpushed | proof chain not yet run; push after it is green |
| `ui#1637` `79e61bdf` | approved; base merge after batch A |
| `ui#1645` `dc5e1809`, batch 1 `fbeb849c` unpushed | copy approved (`/second-opinion` DISAGREE); base merge on top after batch A, prove, push |
| `ui#1648` `aa14d6bc` | approved; base merge after batch A |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch; no Pullfrog approval posts on them |
| `#1294`, `#1291`, `#1296`, `#1239` prepared, orders composed | launch as admission frees slots (17 open pull requests at the relay) |
| Staging | API `86e7467c`, web `ecb276bb` (code identical to `redesign/main`), landing `a50de090`, Orbit Staging 1.3.71 (130) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1634` to `ui#1643`, `ui#1645` to `ui#1650`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or the ticket worktrees |
| Unpushed commits | `ticket-1289-progresso-goals-empty` (`a57cdc3d`), `ticket-1287-shell-scrollbar` (`765b02f5`, `cbb10f7b`), `ticket-1256-typed-text-slots` (`fbeb849c`), `ticket-1242-week-grid-one-scroller` (1, `ui#1633` closed into `#1294`, leave it) |
| Branches with no pull request | `ticket-1294`, `ticket-1291`, `ticket-1296`, `ticket-1239`; older ones in the spec |
| Detached HEADs | scratch build worktrees `base` (`1ce098e5`), `mc-w2` (combined `16411091`), `mc-h1632` (`87c6d16f`), `mc-h1634`, `mc-h1635`, `mc-h1637`, `mc-w1`, and `mc-h1642` if its chain built it; none with work |
| Running workers, subagents | none; the `ui#1642` proof chain and the `ui#1632` and `ui#1650` waiters end with this session |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters; read `gh run list --commit <sha>` before calling a check red; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (worker reports can carry em dashes and machine paths; `extract-final.sh` scrubs them); copy every SHA passed to `--match-head-commit` from this run's output. Run at most six workers while a full layout run or two web builds share the machine. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. When the relay threshold fires, stop every queued gated launch whose gate has not passed.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (35 open Batch R tickets plus `#1297`'s redesign side and `#1303`, listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 162 open, 162 placed, 0 unplaced, 0 placed twice (`reconcile.mjs`; the one new placement is `#1303`, in one Batch R bullet). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried (`carry-next33.sh`).
- Step 1, read the local proofs and rerun unfinished ones: combined check A done (layout remainder 537 passed, every step exit 0); `ui#1632` diagnosis done (49 of 49 on head and base, a flake); `ui#1642` chain started, carried (step 4); `ui#1643` chain carried (step 4).
- Step 2, file the Expo drift, bump on `main`, carry, decide whether `ui#1649` waits: filed `#1303`, `ui#1650` opened; `ui#1649` waits and carries it as a second cherry-pick (decided, logged); merge, repair and audit reruns carried (steps 1 and 2).
- Step 3, merge batch A: carried (step 3), gated on `ui#1649`.
- Step 4, push `ui#1642`, `ui#1643`, `ui#1632`: `ui#1632` done (pushed `87c6d16f`, thread resolved); the other two carried (step 4).
- Step 5, base-merge orders for `ui#1637`, `ui#1645`, `ui#1648`: carried (step 5); `ui#1645`'s copy approval done.
- Step 6, launches: carried (step 6).
- Step 7, release, Orbit Staging 1.3.72 and sweep: carried (step 7), with the sweep method changed because no tab group exists.
- Step 8, Batch R in the spec's order: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
