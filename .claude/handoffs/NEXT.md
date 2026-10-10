/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md` (the owner's decision that bounds this run), `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs and the decision logs) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it rewrites the predecessor id, fixes `SP=` in `mc-prep.sh` and `mc-check.sh`, and links the live builds (`mc-base3` at `434488a2` for red proofs, `mc-c4` the combined tree, `mc-p1674`, `mc-p1704`, `mc-p1708`, `mc-p1711`, `mc-p1712`, `mc-p1713`). After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. The predecessor's own `check-c4/summary.txt` may still be filling in its original scratchpad after the carry; read that path first. Write any helper whose redirect target is a variable with the Write tool (literal paths), run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `pairs.sh <pr>...` (first run per head, shared files between pull requests); `overlap.sh <pattern> <pr>...`; `c-build.sh <label> <sha>...`; `head-build.sh <label> <sha>`; `web-build.sh`; `run-spec.sh <built worktree> <label> <spec>... [playwright flags]`; `prove-new3.sh <label> <head sha> <new spec> [other specs]` and `prove-support3.sh <label> <head sha> <new spec> <support files>...` (red on `mc-base3`, then head build and three green repeats), both wrapped in `gate40.sh` and run one at a time; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then `launch-batch.sh <issue> <worktree> <round> <tier> <relaunch reason>`; `compose-note.sh <issue> <name> [prefix] [base]` for new tickets, then `launch-new2.sh <issue> <worktree>`; `extract-report.sh <worker log> <out>`; `carry-out.sh`; `add-pr.mjs <pr> '#<issue>' <worktree name> <branch>`; `mark-merged.mjs <pr> <merge sha> '#<issue>'`; `reconcile.mjs`. The Bash tool runs zsh, which does not split an unquoted variable into words, and its `ls` prints colour codes (use `/bin/ls` before a `grep`). Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push, with the thread id copied from `node tools/list-bot-threads.mjs --repo ui --pr <n> --no-request --wait-seconds 0` in the same run. A fresh Pullfrog review after a base merge is requested with `node tools/list-bot-threads.mjs --repo ui --pr <n> --re-review --wait-seconds 1800` as a background task. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

The redesign is frozen at 22 tickets; 21 are open. The spec's `## Current state` carries every detail.

1. Restart CI waiters for the 12 open pull requests (at most three waiters, several `--pr` flags each) and read each one's result, approval head and threads with `run-status.mjs`.
2. Read the combined check `c4`. On `OVERALL fail=0` with `redesign/main` still at `85f3650d`, merge `ui#1653` (`f1c74c5a458ef2250ecceabbd4da53800f1cf7e1`), `ui#1681` (`d72e1ae0559ed2c8c912623e80f71d59ba7966ab`), `ui#1686` (`2a6be85f3136a0ea1a43d11668a8d0a7b1d06b32`) and `ui#1706` (`b3718f25640717416f71a7f6b1e1894d3ec3cb07`) with `--match-head-commit` (copy each SHA again from `gh pr view` in the same run), close `#1293`, `#1324`, `#1318` and `#1316` through `tools/complete-ticket.mjs`, `mark-merged.mjs`, tear down their worktrees. Otherwise rerun the check.
3. Then base-merge `ui#1707` (keep both imports in `wayfinding-focus.spec.ts`), push, waiter, fresh approval.
4. `ui#1708`: run `calendar-day-link.spec.ts` on a build of the unpushed `4bd0c46b` (`head-build.sh p1708 4bd0c46b...`, `run-spec.sh`), edit the body with the round, push.
5. Launch the unblocked tickets as blockers merge, each after an overlap check of every open pull request: `#1337` after `#1293`, `#1338` and `#1353` after `#1324`, `#1340`, `#1346` and `#1348` after `#1300`, `#1350` after `#1318` (first check whether `ui#1686` already aligns the Sobre account fact), `#1351` after `#1342`.
6. Merge each open pull request the moment it meets the bar (green checks, a Pullfrog approval submitted after its head's push, zero threads), behind-base ones after a D115 or combined merge-result check. `ui#1704`, `ui#1709` and `ui#1713` share `check-row.tsx`; `ui#1674` and `ui#1713` share `calendar-options.tsx`; `ui#1706` and `ui#1710` share Calendário view tests: the later of each pair takes a base merge. Prove every new or changed layout case red on `mc-base3` (rebuild it at the current `redesign/main` with `head-build.sh base3 <sha>` after merges) and green on its head first; `ui#1674`, `ui#1704`, `ui#1711`, `ui#1712` and `ui#1713` are proven.
7. After each batch of merges: release staging web from `redesign/main`, an Orbit Staging internal build (next is 1.3.76, 135), and, once all 22 are merged, one full rendered sweep when the Mac is idle (`ioreg -c IOHIDSystem` HIDIdleTime above 300 seconds), through one background sweep subagent from a retargeted `sweep-order-<sha>.md` (copy `sweep-order-c1b04051.md`). Under the freeze the sweep files only broken behaviour into Batch R; every polish finding goes to Batch 2b.
8. Then the rest of `## The order` after THE REDESIGN GATE.

## In flight

| item | disposition |
|---|---|
| `ui#1653` `f1c74c5a` (`#1293`) | approved, green; in combined check `c4`; merge on its pass (step 2) |
| `ui#1681` `d72e1ae0` (`#1324`) | approved, green; in `c4`; merge on its pass |
| `ui#1686` `2a6be85f` (`#1318`) | approved, green; in `c4`; merge on its pass |
| `ui#1706` `b3718f25` (`#1316`) | approved, green; in `c4`; merge on its pass |
| `ui#1707` `e338833c` (`#1344`, harness) | approved, green; conflicts with `ui#1653` in one import block; base merge after step 2 |
| `ui#1704` `af646c05` (`#1342`) | rounds 1 to 4 pushed, proven locally 23 of 23; CI and fresh approval owed |
| `ui#1708` `48bafc1c` (`#1354`) | round 1 `4bd0c46b` unpushed; prove `calendar-day-link.spec.ts`, then push (step 4) |
| `ui#1709` `6d1f185f` (`#1299`) | approved; body motion lane fixed; Guards and CI owed |
| `ui#1710` `85055173` (`#1334`) | manifest fix pushed; CI and fresh approval owed |
| `ui#1674` `435f7744` (`#1300`) | batch pushed and proven; CI and fresh approval owed |
| `ui#1711` `a3fe19b0` (`#1347`) | proven 12 of 12; decision recorded in its body; CI and approval owed |
| `ui#1712` `82bd343d` (`#1349`) | proven; CI and approval owed |
| `ui#1713` `151e73ad` (`#1352`) | approved; proven; CI owed |
| Tickets filed this session | `#1355` (Batch 2b, the streak residual of `#1347` under the freeze) |
| Merged this session | `ui#1705` (`#1333`, closed) as `85f3650d` |
| Staging | API `86e7467c`, web `434488a2`, landing `a50de090`, Orbit Staging 1.3.75 (134) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` the 13 above; `orbit-api` none; `orbit-landing-page` none |
| Workers, subagents, workflows | none running at handoff |
| Local checks | combined check `c4` may still be running in the predecessor scratchpad (step 2) |
| CI waiters | stopped by the relay tool; restart (step 1) |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | `ticket-1354-account-row-one-control` `4bd0c46b` (step 4); `ticket-1242-week-grid-one-scroller` `40200ee4` on a branch whose `ui#1633` is closed (kept, as before) |
| Branches with no pull request | merged `fix/ticket-*` branches the teardown tool keeps |
| Detached HEADs | scratch build worktrees `mc-*`; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back. A progress report leads with how many of the 22 redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; one hermetic Playwright run at a time under the scratchpad lock, and one proof against `mc-base3` at a time; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits when every named pull request settles, on `HEAD_MOVED`, `PR_CLOSED` or a transient `READ_ERROR`, so restart it; to add a pull request, stop a waiter with TaskStop and restart it with the extra `--pr`); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; attribute a layout red with a run of the same spec on `mc-base3` before sending it to a head; never chain a base merge and a push; edit a pull request body before its push, never in the same minutes after it (while CI runs, post evidence as a comment); in a ui pull request body, write a ticket as `thomasluizon/orbit-tickets#N`; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. Gate a proof's head build on a one-minute load under 40. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A worker diff that edits a gate (`tools/`, `eslint-rules/`, a guard) is read line by line before the push. A Surface Manifest Drift red on a worker's pull request is regenerated by the orchestrator (`node tools/surface-manifest.mjs`, plus any stale id in `tools/redesign-groups.json`) and a Redesign Review Harness red on body wording is fixed in the body. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: finish the redesign at the frozen 22 tickets ("finish this god damn thing"). When all 22 are merged and closed, staging web is released from `redesign/main`, an Orbit Staging internal build follows the last merge, and a full rendered sweep finds no broken behaviour, send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open count against the 22 separately from the board. Where a control sits is the run's call.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the frozen redesign done (the 22 tickets in the Batch R lead, 21 open now), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 149 open, 149 placed, 0 unplaced (`reconcile.mjs`, after `#1355` was placed in Batch 2b); 0 placed twice by placement. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried (helpers updated: `pairs.sh`, `overlap.sh`, `prove-support3.sh`, `gate40.sh`; the one-proof-at-a-time rule and the manifest and body-wording red handling added).
- Step 1, restart CI waiters: done this session; carried as step 1 for the new session.
- Step 2, `ui#1704` round 3: done (`ad5738fa`, proven); round 4 for the shared row geometry spec also done (`af646c05`, pushed).
- Step 3, `ui#1674` batch: done (`435f7744`, proven, pushed).
- Step 4, launch `#1347`, `#1349`, `#1352`: done (`ui#1711`, `ui#1712`, `ui#1713`); the `#1347` sheet question is decided (no restructure, `#1355` in Batch 2b).
- Step 5, merge on the bar: `ui#1705` merged; `ui#1653`, `ui#1681`, `ui#1686`, `ui#1706` carried in the combined check (step 2); the rest carried (step 6).
- Step 6, launch the rest as blockers merge: carried (step 5); no blocker merged yet.
- Step 7, staging release, internal build and sweep: carried (step 7).
- Step 8, Batch R then the order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
