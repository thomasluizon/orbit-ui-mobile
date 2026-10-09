/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, layout logs, local spec logs `hs-*.log`, `note-1298-rb3.md`, `note-1301-rb6.md`, `note-1316.md`, `report-1290rb1.md`, `sweep-order-aa14c594.md`, `lead-544-580.md`, `body-sheet-title-race.md`, `prev-sleep-decisions-*.md` and the decision log) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it skips the scratch build worktrees (`base`, `mc-*`). After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad (fix with `sed` if not). The predecessor's own scratchpad (session id starting `c5898c74`, beside the new one in the system temporary directory) holds live builds: `mc-a1673` (redesign/main `aa14c594` plus `ui#1673` `34cc1354`), `mc-h1653` (`ui#1653` head `d07ab3b6`), and symlinks `mc-h1677c` (base `858d3b5a` plus `ui#1677`: a base build for anything outside the composer hover case), `mc-t3` (base plus `ui#1673` plus `ui#1654`), `mc-r2` and `mc-h1678` (probe-edited `row-geometry.spec.ts`; restore it with `git checkout` before reuse); symlink the ones you need into the new scratchpad. Write any helper whose redirect target is a variable with the Write tool, run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Never put `rm -rf` of the Playwright lock after a `;` in a command that may not own the lock. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `cut-report.sh`; `batch-merge-body.sh <pr> <report> <sha prefix> [--ui-scope]`; `lg-cases.sh <label> <run id>`; `err-blocks.sh`; `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `base-delta-overlap.sh`; `diag-head.sh`; `head-build.sh <label> <sha>`; `head-spec.sh <label> <worktree label> <spec> [grep]` (loop it in a script for repeats); `layout-only.sh <worktree> <label>`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then a case in `launch-rb.sh`; `ticket-files.sh`, `overlap-note.sh`, `compose-note.sh`, `launch-new.sh` for a new ticket; `add-pr.mjs` and `mark-merged.mjs <pr> <merge sha> '#<issue>'` keep the run state; `reconcile.mjs` reconciles the board with the spec. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. Dependabot pull requests get their Pullfrog review from a `@pullfrog review` comment. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

The spec's `## Current state` carries every detail below (the settled r2 reds, the merge plan and each batch's content).

1. `ui#1678` (`#1290`): batch 1 is committed and NOT pushed (`9fc4d2d0` in `ticket-1290-list-row-owner`). Build the head, prove `row-geometry.spec.ts` green on the head and red on a base build (plus any other changed spec the report names), merge the report into the body (`batch-merge-body.sh 1678 report-1290rb1.md 9fc4d2d0 --ui-scope`, and scrub its temporary file link), resolve both threads on that commit, push once, then CI, a fresh approval and a full combined check before merge.
2. `ui#1673` (`#1298`): compose and launch batch 3 now (`compose-rb.sh 1298 ticket-1298-calendar-stable-frame rb3`, add a `1298rb3` case to `launch-rb.sh`, `--hard-ceiling-minutes 75`). Prove `calendar-grid-column.spec.ts` loading=true green three times on a build of the result (it failed 3 to 5 cases per run on `mc-a1673`).
3. `ui#1653` (`#1293`, `d07ab3b6`, pushed): wait for CI and a fresh Pullfrog approval of that head.
4. When `ui#1673` batch 3 is approved and green: merge `ui#1673` and `ui#1653` at their approved heads on a full combined check whose only red is `focus-rings` Calendário (owned by `ui#1654`); close `#1298` and `#1293`; tear down their worktrees; then send `ui#1654` batch 1 at once with its probed reds.
5. After `ui#1673` merges: `ui#1664` batch 6 (`note-1301-rb6.md`), launch `#1316` (`note-1316.md`), send `ui#1674` its batch. After `ui#1654` merges: `#1299`. After `ui#1664` merges: `#1306`, `#1307` and `#1317`.
6. Now, in parallel with the workers: the rendered sweep of staging web `aa14c594` through one sweep subagent with `sweep-order-aa14c594.md` (it includes the 544 versus 580 lead), then file one ticket per verified root cause and place each in Batch R.
7. After 00:15 Sao Paulo (the staging pinger stops at 23:55 and the free API sleeps 15 minutes later): `ui#1669`'s staging sleep proof on `https://app-staging.useorbit.org` (the page wakes the sleeping API and loads without an error screen; record the network trail).
8. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132) to the internal track, and sweep the released commit.
9. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1678` `0e64759d` pushed, `9fc4d2d0` local (`#1290`) | batch 1 done locally, prove and push (step 1) |
| `ui#1673` `34cc1354` (`#1298`) | approved, 0 threads; batch 3 to launch (step 2) |
| `ui#1653` `d07ab3b6` (`#1293`) | batch 4 pushed; waits for CI and approval (step 3) |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges (step 4) |
| `ui#1664` `c004b094` (`#1301`) | approved; batch 6 after `ui#1673` (step 5) |
| `ui#1674` `c4eeec60` (`#1300`) | batch after `ui#1673` (step 5) |
| Workers, subagents, workflows | none running |
| Local checks | none running |
| CI waiters | none after the relay (the relay tool stops them); start new ones |
| Staging | API `86e7467c`, web `aa14c594`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1653`, `ui#1654`, `ui#1664`, `ui#1673`, `ui#1674`, `ui#1678`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | `ticket-1290-list-row-owner`: 13 commits up to `9fc4d2d0` (step 1); none elsewhere |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept); `fix/ticket-1312-composer-hover-settled` (merged `ui#1677`; tear its worktree down with `teardown-worktree.mjs`) |
| Detached HEADs | scratch build worktrees `mc-*` in this and older scratchpads; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits on `HEAD_MOVED` or a transient `READ_ERROR`, so restart it); read `gh run list --commit <sha>` before calling a check red (a cancelled duplicate beside a green rerun is not red); a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A layout red that needs a cause gets a probe spec (copy a small diagnostic spec into a scratch build and log `document.activeElement`, `isConnected`, console errors and page errors) before a batch is ordered; attribute a red with builds of the base with and without one head before sending it to that head. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 137 open, 137 placed, 0 unplaced (`reconcile.mjs`), 0 placed twice by placement (ten open tickets, `#28`, `#179`, `#196`, `#237`, `#238`, `#385`, `#394`, `#418`, `#556`, `#746`, are also mentioned in a second batch as cross-references). The redesign has 11 open tickets: `#1286`, `#1290`, `#1293`, `#1298` to `#1301`, `#1306`, `#1307`, `#1316`, `#1317`. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried.
- Step 1, settle the r2 reds: done. `calendar-grid-column` belongs to `ui#1673` (batch 3 written, step 2); the sheet title detach is a base race filed as `#1317`; `ui#1653`'s DateField race is fixed in its pushed batch 4.
- Step 2, merge `ui#1677`: done (`feaaea74`, `#1312` closed).
- Step 3, `ui#1678` batch: done locally (`9fc4d2d0`); its proof and push are carried (step 1).
- Step 4, the `ui#1673` and `ui#1653` merge and `ui#1654` batch 1: carried (step 4), now behind `ui#1673` batch 3.
- Step 5, `ui#1664` batch 6, `#1316`, `ui#1674`, `#1299`, `#1306`, `#1307`: carried (step 5), with `#1317` added.
- Step 6, Dependabot `ui#1638`, `ui#1646`, `ui#1647`: done (`main` `57242efd`, `e8deff18`, `2c9bd6e7`).
- Step 7, staging release, Orbit Staging 1.3.73, sleep proof, sweep and the 544 versus 580 lead: staging web released at `aa14c594`; the sweep (with the lead) is carried as step 6, the sleep proof as step 7, the next release and internal build as step 8.
- Step 8, Batch R then the order: carried (step 9).

Every identifier here came from a previous session: treat each as a lead to verify.
