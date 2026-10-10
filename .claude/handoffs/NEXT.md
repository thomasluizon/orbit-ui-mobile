/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs and the decision logs) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it rewrites the predecessor id, fixes `SP=` in `mc-prep.sh` and `mc-check.sh`, and links the live builds: `mc-base2` (`86df48c4`, plain build), `mc-h1695c` (`ec55c49e`), `mc-h1699b` (`38318ca0`), `mc-h1700` (`754987f8`), `mc-c1700`, `mc-h1701` (`f4800f56`, hermetic build), `mc-h1702` (`eab19c8c`), `mc-h1698b` (`a946c3d5`), `mc-h1654`, `mc-h1673`, `mc-h1681`, `mc-trio`, `mc-c1654` and `base`. After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. Write any helper whose redirect target is a variable with the Write tool (the guardrail refuses a redirect into `$VAR` paths; use literal paths), run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file (zsh does not split words). Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `c-build.sh <label> <sha>...`; `head-build.sh <label> <sha>`; `web-build.sh` (every build helper calls it: the tree's `build:hermetic` when present, else the plain build); `run-spec.sh <built worktree> <label> <spec>... [playwright flags]`; `prove-new.sh <label> <head sha> <new spec> [other specs]`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then `launch-batch.sh <issue> <worktree> <round> <tier> <relaunch reason>` (a continuation order: write a preface, `cat` it before the original order into `order-<issue>-cont.md`, launch with round `cont`); `compose-note.sh <issue> <name> [prefix] [base]` for new tickets, then `launch-new2.sh <issue> <worktree>`; `extract-report.sh <worker log> <out>`; `wait-loop.sh <label> <wait-ci.mjs arguments>`; `carry-out.sh` (edit its build list first); `chain-body.sh <pr> <report>...` (then replace every "not run" claim the local proof answers and every en dash); `add-pr.mjs <pr> '#<issue>' <worktree name> <branch>`; `mark-merged.mjs <pr> <merge sha> '#<issue>'`; `reconcile.mjs`. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push, with the thread id copied from `node tools/list-bot-threads.mjs --repo ui --pr <n> --no-request --wait-seconds 0` in the same run. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order (harness first)

The spec's `## Current state` carries every detail below.

1. Start CI waiters (at most three, fold pull requests): `ui#1701` (`#1343`, harness: merge on the bar; after it, `build:hermetic` is the local build), `ui#1695` (`ec55c49e`: CI and a fresh approval, then merge), `ui#1697`, `ui#1698`, `ui#1702`. Read `rereview-1673.out` for `ui#1673`'s requested re-review.
2. Relaunch `#1286` with a continuation order on `ticket-1286-calendar-day-circle` (`91844536` and `874edaa4` committed, unpushed; the `tb2` worker hit its ceiling in verification): verify, report, no push. Then prove `calendar-day-circle.spec.ts`, `focus-rings.spec.ts` and `press-shape.spec.ts` on its head, carry `report-1286-tb1` and the new report into `ui#1654`'s body, push.
3. Launch `#1332` round `rb2` (`launch-batch.sh 1332 ticket-1332-astra-block-gap rb2 default <reason>`, composed), then prove `astra-block-spacing.spec.ts` x3 on its head and push `ui#1699`.
4. `ui#1700`: prove `834cf4a8` (`label-fit-settings-row.spec.ts`, `personal-account-row-height.spec.ts`, `label-fit.spec.ts` on a hermetic head build), carry `report-1336-rb1.md` into the body, push.
5. The trio `ui#1673`, `ui#1654`, `ui#1653` merges on one combined check (`mc-prep.sh` the three heads, `FORCE_CI=1 mc-check.sh`) after `ui#1654` pushes and every head is approved; then `ui#1681` (base merge), `#1344`, `ui#1686`'s batch (`note-1318-bm3.md`), `ui#1674`'s batch, `#1316`, `#1299`, and the blocked sweep tickets as their blockers merge (`#1333`, `#1334`, `#1337`, `#1338`, `#1340`, `#1342`).
6. Prove every new or changed layout case red on the base and green on the head before any merge. Rebuild `mc-base2` at the current `redesign/main` first (`head-build.sh base2 <sha>`); every worker-authored layout spec this run failed on its own head or needed a round.
7. After the next product merges: release `redesign/main` web to staging, dispatch the next Orbit Staging internal build (1.3.74 (133); the staging API must be Healthy at `86e7467c`), and run the next full rendered sweep when the Mac is idle (`ioreg -c IOHIDSystem` HIDIdleTime above 300 seconds). File every finding one ticket per root cause through `tools/create-ticket.mjs` after verifying its owner file on both platforms.
8. Then the rest of Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1701` `f4800f56` (`#1343`) | approved, first CI pending; browser probe proved the stream reaches the mock (step 1) |
| `ui#1695` `ec55c49e` (`#1328`) | pushed, Android thread resolved, week specs proven; CI and fresh approval pending (step 1) |
| `ui#1697` `697e238c` (`#1335`) | pushed, copy approved and posted; CI and fresh approval pending (step 1) |
| `ui#1698` `a946c3d5` (`#1339`) | pushed, layout proof in body; CI and fresh approval pending (step 1) |
| `ui#1702` `eab19c8c` (`#1341`) | opened this session, layout proof posted; first CI and review pending (step 1) |
| `ui#1699` `35ba606f` (`#1332`) | `38318ca0` committed unpushed; `rb2` composed (step 3) |
| `ui#1700` `754987f8` (`#1336`) | Layout Guard red found; `834cf4a8` committed unpushed; proof owed (step 4) |
| `ui#1654` `c8ac28ac` (`#1286`) | `91844536`, `874edaa4` unpushed; continuation relaunch (step 2) |
| `ui#1673` `682f85e8` (`#1298`) | base merge pushed; settled focus-ring red only; re-review requested (step 5) |
| `ui#1653` `199647dd` (`#1293`) | approved; merges with the trio (step 5) |
| `ui#1681`, `ui#1686`, `ui#1674` | approved; after the trio (step 5) |
| Merged this session | `ui#1692` (`86df48c4`, `#1306`), `ui#1694` (`616ce540`, `#1329`), both tickets closed and worktrees removed |
| Staging | API `86e7467c`, web `fef35211`, landing `a50de090`, Orbit Staging 1.3.73 (132) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1653`, `ui#1654`, `ui#1673`, `ui#1674`, `ui#1681`, `ui#1686`, `ui#1695`, `ui#1697` to `ui#1702`; `orbit-api` none; `orbit-landing-page` none |
| Workers, subagents, workflows | none running at handoff |
| CI waiters | stopped by the relay tool; start them (step 1) |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | `ticket-1286-calendar-day-circle` (2), `ticket-1332-astra-block-gap` `38318ca0`, `ticket-1336-listrow-personal-height` `834cf4a8`; `ticket-1242-week-grid-one-scroller` `40200ee4` on a branch whose `ui#1633` is closed (kept, as before) |
| Branches with no pull request | merged `fix/ticket-1306-animation-settle`, `fix/ticket-1329-classifier-stdio-deadline` (local branches retained by the teardown tool), and the older ones the spec lists |
| Detached HEADs | scratch build worktrees `mc-*` and `base`; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits when every named pull request settles, on `HEAD_MOVED`, `PR_CLOSED` or a transient `READ_ERROR`, so restart it); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; edit a pull request body before its push, never in the same minutes after it (while CI runs, post evidence as a comment); check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. Hold proof builds while four or more workers run their suites (the load passed 130 and pushed a worker to its 75 minute ceiling); gate a proof's head build on a one-minute load under 40. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A layout red that needs a cause gets a probe spec (tag its output `[DEBUG-xxxx]`, delete it and its `e2e/.results` residue after) before a batch is ordered; attribute a red with builds of the base with and without one head before sending it to that head. Before composing a batch, check every open pull request for a change the batch would duplicate. A CI tools red is read from the job log with `gh api repos/thomasluizon/orbit-ui-mobile/actions/jobs/<job>/logs --allow-escape-sequences` or `gh run view <run> --log-failed`. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: continue the work until the redesign is done; harness tickets first, then the rest of the design. When everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 22 open redesign and harness tickets in `## Current state`, plus every ticket the sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 149 open, 149 placed, 0 unplaced (`reconcile.mjs`). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried (build links refreshed, `web-build.sh` added, the load rule for proof builds added).
- Step 1, the six composed batches and the `#1341` relaunch: done; `#1329` merged as `ui#1694`; `#1298` `bm4` pushed (`682f85e8`); `#1335`, `#1339` pushed; `#1341` opened `ui#1702`; `#1332` ran and needs `rb2` (step 3); `#1286` `tb2` hit its ceiling (step 2); `#1343` composed and opened `ui#1701`.
- Step 2, CI waiters: done for `ui#1692` (merged `86df48c4` after 522 of 522 on the combined build) and `ui#1700` (a Layout Guard red, now round `rb1`, step 4); the rest carried (step 1).
- Step 3, `ui#1695`'s Android round: done (`ec55c49e` pushed, thread resolved); merge carried (step 1).
- Step 4, the trio and the post-trio queue: carried (step 5).
- Step 5, prove every layout case: carried (step 6).
- Step 6, the staging release, internal build and sweep: carried (step 7).
- Step 7, Batch R then the order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
