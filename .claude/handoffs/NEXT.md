/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs and the decision logs) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it rewrites the predecessor id, fixes `SP=` in `mc-prep.sh` and `mc-check.sh`, and links the live builds: `mc-base2` (`64daf5e1`, hermetic), `mc-h1695c` (`ec55c49e`), `mc-h1699b` (`f457124d`), `mc-h1654` (`60542c4c`), `mc-h1673`, `mc-h1681`, `mc-trio`, `mc-c1654`, `mc-duo` and `base`. After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. Write any helper whose redirect target is a variable with the Write tool (literal paths), run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `c-build.sh <label> <sha>...`; `head-build.sh <label> <sha>`; `web-build.sh` (every build helper and `mc-check.sh` call it: the tree's `build:hermetic`, else the plain build with both API bases on the mock); `run-spec.sh <built worktree> <label> <spec>... [playwright flags]`; `prove-new.sh <label> <head sha> <new spec> [other specs]`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then `launch-batch.sh <issue> <worktree> <round> <tier> <relaunch reason>` (a continuation order: write a preface, `cat` it before the original order into `order-<issue>-cont.md`, launch with round `cont`); `compose-note.sh <issue> <name> [prefix] [base]` for new tickets, then `launch-new2.sh <issue> <worktree>`; `extract-report.sh <worker log> <out>`; `wait-loop.sh <label> <wait-ci.mjs arguments>`; `carry-out.sh` (edit its build list first); `chain-body.sh <pr> <report>...` (then replace every "not run" claim the local proof answers, and check dashes and machine paths); `add-pr.mjs <pr> '#<issue>' <worktree name> <branch>`; `mark-merged.mjs <pr> <merge sha> '#<issue>'`; `reconcile.mjs`. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push, with the thread id copied from `node tools/list-bot-threads.mjs --repo ui --pr <n> --no-request --wait-seconds 0` in the same run. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order (harness first)

The spec's `## Current state` carries every detail below.

1. Start CI waiters (at most three, fold pull requests): `ui#1703` (`#1345`, harness), `ui#1699`, `ui#1654`, `ui#1673`. Merge `ui#1703` on the bar when green.
2. `ui#1695` (`#1328`, harness): settle its stale-base `action-rows.spec.ts:221` red with a D115 local merge-result check (`mc-prep.sh d1695 ec55c49ed9209abb9800882055d2fdfa876d90f6`, then `FORCE_CI=1 mc-check.sh`), then merge at `ec55c49e`.
3. `ui#1673`: request a Pullfrog review of `023500f8` (`node tools/list-bot-threads.mjs --pr 1673 --repo ui --wait-seconds 900 --re-review`). When `ui#1654` and `ui#1673` are green and approved at their heads, run the trio's combined check (`mc-prep.sh trio <1673 head> <1654 head> <1653 head>`, `FORCE_CI=1 mc-check.sh`), which must show `calendar-day-circle.spec.ts` loading cases green, then merge `ui#1673`, `ui#1654`, then `ui#1653` (base merge for the `CLAUDE.md` registry conflict).
4. Merge `ui#1699` on the bar when green and approved.
5. After the trio: `ui#1681` (base merge), `#1344`, `ui#1686`'s batch (`note-1318-bm3.md`), `ui#1674`'s batch, `#1316`, `#1299`, and the blocked sweep tickets as their blockers merge (`#1333`, `#1334`, `#1337`, `#1338`, `#1340`). `#1342` is unblocked now (`#1341` merged): compose and launch it.
6. Prove every new or changed layout case red on the base and green on the head before any merge. Rebuild `mc-base2` at the current `redesign/main` first (`head-build.sh base2 <sha>`).
7. Release `redesign/main` web to staging now that five product fixes merged (and again after the trio), dispatch the next Orbit Staging internal build (1.3.74 (133); the staging API must be Healthy at `86e7467c`), and run the next full rendered sweep when the Mac is idle (`ioreg -c IOHIDSystem` HIDIdleTime above 300 seconds). File every finding one ticket per root cause through `tools/create-ticket.mjs` after verifying its owner file on both platforms.
8. Then the rest of Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1703` `c5c8d254` (`#1345`) | approved after its push; last CI job pending (step 1) |
| `ui#1695` `ec55c49e` (`#1328`) | approved, green except a stale-base Layout Guard red; D115 check owed (step 2) |
| `ui#1699` `f457124d` (`#1332`) | pushed with its layout proof, approved; CI pending (step 4) |
| `ui#1654` `60542c4c` (`#1286`) | pushed and approved; CI pending; trio combined check owed (step 3) |
| `ui#1673` `023500f8` (`#1298`) | docs fix pushed; Pullfrog review not yet posted (step 3) |
| `ui#1653` `199647dd` (`#1293`) | approved; merges with the trio (step 3) |
| `ui#1681`, `ui#1686`, `ui#1674` | approved; after the trio (step 5) |
| Merged this session | `ui#1701` (`64daf5e1`, `#1343`), `ui#1697` (`6bdc32da`, `#1335`), `ui#1698` (`0a1f2596`, `#1339`), `ui#1702` (`02723ab5`, `#1341`), `ui#1700` (`0ab81af7`, `#1336`); tickets closed, worktrees removed |
| New ticket | `#1345` (harness, `ui#1703`) |
| Staging | API `86e7467c`, web `fef35211`, landing `a50de090`, Orbit Staging 1.3.73 (132) on internal; release owed (step 7) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1653`, `ui#1654`, `ui#1673`, `ui#1674`, `ui#1681`, `ui#1686`, `ui#1695`, `ui#1699`, `ui#1703`; `orbit-api` none; `orbit-landing-page` none |
| Workers, subagents, workflows | none running at handoff |
| CI waiters | stopped by the relay tool; start them (step 1) |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | only `ticket-1242-week-grid-one-scroller` `40200ee4` on a branch whose `ui#1633` is closed (kept, as before) |
| Branches with no pull request | merged `fix/ticket-1335-*`, `fix/ticket-1336-*`, `fix/ticket-1339-*`, `fix/ticket-1341-*`, `fix/ticket-1343-*` (local branches retained by the teardown tool), and the older ones the spec lists |
| Detached HEADs | scratch build worktrees `mc-*` and `base`; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits when every named pull request settles, on `HEAD_MOVED`, `PR_CLOSED` or a transient `READ_ERROR`, so restart it; to add a pull request, stop a waiter with TaskStop and restart it with the extra `--pr`); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; edit a pull request body before its push, never in the same minutes after it (while CI runs, post evidence as a comment); in a ui pull request body, write a ticket as `thomasluizon/orbit-tickets#N`, because a bare `#N` names a ui pull request; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. Hold proof builds while four or more workers run their suites; gate a proof's head build on a one-minute load under 40. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A worker diff that edits a gate (`tools/`, `eslint-rules/`, a guard) is read line by line before the push, and its tools cases must still fail the defect it guards. A layout red that needs a cause gets a probe spec (tag its output `[DEBUG-xxxx]`, delete it and its `e2e/.results` residue after) before a batch is ordered; attribute a red with builds of the base with and without one head before sending it to that head. Before composing a batch, check every open pull request for a change the batch would duplicate. A CI tools red is read from the job log with `gh api repos/thomasluizon/orbit-ui-mobile/actions/jobs/<job>/logs --allow-escape-sequences` or `gh run view <run> --log-failed`. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: continue the work until the redesign is done; harness tickets first, then the rest of the design. When everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 18 open redesign and harness tickets in `## Current state`, plus every ticket the sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 145 open, 145 placed, 0 unplaced, 0 placed twice (`reconcile.mjs`). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried (build links refreshed; gate-edit reading rule, waiter restart rule and the ticket link rule added).
- Step 1, CI waiters: done for `ui#1701` (merged `64daf5e1`), `ui#1697` and `ui#1698` (merged on combined check `mc-duo`, layout 1789 of 1789), `ui#1702` (merged `02723ab5` after a rerun of a timed-out unit job, cause filed as `#1345`); `ui#1695` carried (step 2).
- Step 2, `#1286` continuation: done (`60542c4c`, proven 58 of 61 on its head with the 3 loading reds attributed to the missing `ui#1673` frame, pushed); trio carried (step 3).
- Step 3, `#1332` rb2: done (`f457124d`, 109 of 109 locally, pushed); merge carried (step 4).
- Step 4, `ui#1700`: done (`834cf4a8` proven 361 of 361, pushed, merged `0ab81af7`).
- Step 5, the trio and the post-trio queue: carried (steps 3 and 5); `#1342` unblocked by the `#1341` merge.
- Step 6, prove every layout case: carried (step 6); `mc-base2` rebuilt at `64daf5e1`.
- Step 7, staging release, internal build and sweep: carried (step 7).
- Step 8, Batch R then the order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
