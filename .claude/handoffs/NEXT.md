/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md` (new, the owner's decision that bounds this run), `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs and the decision logs) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it rewrites the predecessor id, fixes `SP=` in `mc-prep.sh` and `mc-check.sh`, and links the live builds: `mc-base3` (`434488a2`, the current base, for red proofs), `mc-base2` (`c1b04051`, before `#1298`), `mc-p1704`, `mc-p1653`, `mc-p1705`, `mc-p1707`, `mc-p1708` and `mc-p1709`. After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. Write any helper whose redirect target is a variable with the Write tool (literal paths), run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `c-build.sh <label> <sha>...`; `head-build.sh <label> <sha>`; `web-build.sh`; `run-spec.sh <built worktree> <label> <spec>... [playwright flags]`; `prove-new.sh` (red on `mc-base2`) and `prove-new3.sh` (red on `mc-base3`) `<label> <head sha> <new spec> [other specs]`; `red-with-support.sh <label> <head sha> <spec> <support file>...`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then `launch-batch.sh <issue> <worktree> <round> <tier> <relaunch reason>`; `compose-note.sh <issue> <name> [prefix] [base]` for new tickets, then `launch-new2.sh <issue> <worktree>`; `extract-report.sh <worker log> <out>`; `carry-out.sh`; `chain-body.sh <pr> <report>...`; `add-pr.mjs <pr> '#<issue>' <worktree name> <branch>`; `mark-merged.mjs <pr> <merge sha> '#<issue>'`; `reconcile.mjs`; `inventory.sh`. The Bash tool runs zsh, which does not split an unquoted variable into words: pass each argument literally or use a bash script file. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push, with the thread id copied from `node tools/list-bot-threads.mjs --repo ui --pr <n> --no-request --wait-seconds 0` in the same run. A fresh Pullfrog review after a base merge is requested with `node tools/list-bot-threads.mjs --repo ui --pr <n> --re-review --wait-seconds 1800` as a background task. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

The redesign is frozen at 22 tickets (the spec's Batch R lead and the ADR above). Every step below serves those 22. The spec's `## Current state` carries every detail.

1. Restart CI waiters for the 11 open pull requests (at most three waiters, several `--pr` flags each) and read each one's result, approval head and threads with `run-status.mjs`.
2. `ui#1704` (`#1342`): launch round 3 (`compose-rb.sh 1342 ticket-1342-day-row-floor rb3`, then `launch-batch.sh 1342 ticket-1342-day-row-floor rb3 mechanical <reason>`); it builds on the unpushed `bf100515` and `da699d39`. Prove `calendar-day-card.spec.ts` and `calendar-day-habit-rows.spec.ts` on a build of its head, edit the body with the round evidence, push, then CI and a fresh approval.
3. `ui#1674` (`#1300`): launch its batch from `note-1300-bm2.md` (`compose-rb.sh 1300 ticket-1300-header-first-frame bm2`, `launch-batch.sh ... default <reason>`); prove `profile-top-inset.spec.ts` and `destination-header-first-paint.spec.ts` on its head before the push.
4. Launch `#1347`, `#1349` and `#1352` from `note-1347.md`, `note-1349.md` and `note-1352.md` (`compose-note.sh`, then `launch-new2.sh`), each after a check of every open pull request for overlap.
5. Merge each open pull request the moment it meets the bar (green checks, a Pullfrog approval submitted after its head's push, zero threads), behind-base ones after a D115 or combined merge-result check. Prove every new or changed layout case red on `mc-base3` (rebuild it at the current `redesign/main` with `head-build.sh base3 <sha>` after merges) and green on its head first; `ui#1705`, `ui#1707`, `ui#1708` and `ui#1709` are already proven. `ui#1709` and `ui#1704` share `check-row.tsx` lines; `ui#1706` and `ui#1710` share Calendário view tests: the second of each pair takes a base merge.
6. As blockers merge, launch the rest of the 22: `#1337` after `#1293`, `#1338` and `#1353` after `#1324`, `#1340`, `#1346` and `#1348` after `#1300`, `#1350` after `#1318` (first check whether `ui#1686` already aligns the Sobre account fact), `#1351` after `#1342`.
7. After each batch of merges: release staging web from `redesign/main`, an Orbit Staging internal build (next is 1.3.76, 135), and, once all 22 are merged, one full rendered sweep when the Mac is idle (`ioreg -c IOHIDSystem` HIDIdleTime above 300 seconds), through one background sweep subagent from a retargeted `sweep-order-<sha>.md` (copy `sweep-order-c1b04051.md`). Under the freeze the sweep files only broken behaviour into Batch R; every polish finding goes to Batch 2b.
8. Then the rest of `## The order` after THE REDESIGN GATE.

## In flight

| item | disposition |
|---|---|
| `ui#1653` `f1c74c5a` (`#1293`) | base merge pushed; one flaky `fab-notice` case rerun (passes 10 of 10 locally on base and head); fresh Pullfrog review requested; merge on the bar |
| `ui#1674` `70884294` (`#1300`) | base merge pushed; 5 `profile-top-inset` reds belong to it; batch owed (step 3) |
| `ui#1681` `d72e1ae0` (`#1324`) | base merge plus `threadScroll` suite fix pushed; CI and fresh approval owed |
| `ui#1686` `2a6be85f` (`#1318`) | base merge plus drawn widths pushed; content edge specs 61 of 61 locally; CI and fresh approval owed |
| `ui#1704` `27484066` (`#1342`) | rounds 1 and 2 unpushed in the ticket worktree (`da699d39`); round 3 owed (step 2) |
| `ui#1705` `2bb0c7ae` (`#1333`) | proven; CI and review owed |
| `ui#1706` `b3718f25` (`#1316`) | CI and review owed |
| `ui#1707` `e338833c` (`#1344`, harness) | proven; CI and review owed |
| `ui#1708` `e47f368a` (`#1354`) | proven; CI and review owed |
| `ui#1709` `6d1f185f` (`#1299`) | proven (3 of 3 red, 9 of 9 green); CI and review owed |
| `ui#1710` `8a468803` (`#1334`) | CI and review owed |
| Tickets filed this session | `#1346` to `#1354` (the `c1b04051` sweep, one per root cause, placed in Batch R) |
| Owner decision this session | the redesign is frozen at 22 tickets (spec rules 68, 77, 98, Batch R lead, ADR D144) |
| Staging | API `86e7467c`, web `434488a2`, landing `a50de090`, Orbit Staging 1.3.75 (134) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` the 11 above; `orbit-api` none; `orbit-landing-page` none |
| Workers, subagents, workflows | none running at handoff |
| CI waiters | stopped by the relay tool; restart (step 1) |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | `ticket-1342-day-row-floor` `bf100515`, `da699d39` (step 2); `ticket-1242-week-grid-one-scroller` `40200ee4` on a branch whose `ui#1633` is closed (kept, as before) |
| Branches with no pull request | `ticket-1347-streak-loading-frame` (created, no commits, step 4); merged `fix/ticket-*` branches the teardown tool keeps |
| Detached HEADs | scratch build worktrees `mc-*`; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back. A progress report leads with how many of the 22 redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits when every named pull request settles, on `HEAD_MOVED`, `PR_CLOSED` or a transient `READ_ERROR`, so restart it; to add a pull request, stop a waiter with TaskStop and restart it with the extra `--pr`); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; attribute a layout red with a run of the same spec on `mc-base3` before sending it to a head; never chain a base merge and a push; edit a pull request body before its push, never in the same minutes after it (while CI runs, post evidence as a comment); in a ui pull request body, write a ticket as `thomasluizon/orbit-tickets#N`; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. Gate a proof's head build on a one-minute load under 40. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A worker diff that edits a gate (`tools/`, `eslint-rules/`, a guard) is read line by line before the push. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: finish the redesign at the frozen 22 tickets ("finish this god damn thing"). When all 22 are merged and closed, staging web is released from `redesign/main`, an Orbit Staging internal build follows the last merge, and a full rendered sweep finds no broken behaviour, send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open count against the 22 separately from the board. Where a control sits is the run's call.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the frozen redesign done (the 22 tickets in the Batch R lead, all open now), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 149 open, 149 placed, 0 unplaced (`reconcile.mjs`); 0 placed twice by placement. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried (the freeze ADR added to the list, build links refreshed, `prove-new3.sh` and the re-review command added; the owner instruction now names the frozen 22 and the "no broken behaviour" sweep bar, which supersedes "a full rendered sweep finding nothing").
- Step 1, file the `c1b04051` sweep findings: done (`#1346` to `#1354`; L1 not a defect; F3 not folded into `#1300`, a different cause).
- Step 2, release `23be8277` or later to staging and Orbit Staging 1.3.75 (134): done (web run 38061095178 at `434488a2`, Android run 38061408028, Play upload success).
- Step 3, `ui#1704` round 2: done (`da699d39`, unpushed); round 3 carried (step 2).
- Step 4, launch `#1316`, `#1299`, `#1344`, `#1333`, `#1334`: done (`ui#1706`, `ui#1709`, `ui#1707`, `ui#1705`, `ui#1710`).
- Step 5, base merges for `ui#1653`, `ui#1681`, `ui#1686` and `ui#1674`: done (all four pushed); `#1337`, `#1338` and `#1340` carried (step 6).
- Step 6, prove every layout case: carried (step 5); `mc-base3` built at `434488a2`.
- Step 7, staging release, internal build and sweep after each batch: carried (step 7), with the freeze's sweep bar.
- Step 8, Batch R then the order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
