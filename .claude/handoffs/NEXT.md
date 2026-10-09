/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, local spec logs `hs-*.log`, the batch reports `report-1290rb3.md` and `report-1298rb4.md`, the sweep reports `sweep-aa14c594.md` and `sweep-aa14c594-cont.md`, the composed orders `order-1320.md`, `order-1321.md`, `order-1322.md`, `prev-sleep-decisions-*.md` and the decision log) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it rewrites the predecessor id, fixes `SP=` in `mc-prep.sh` and `mc-check.sh`, and links the live builds from the predecessor scratchpad (session id starting `3b7f602e`, beside the new one in the system temporary directory): `mc-h1673b3` (`ui#1673` head `b31e2952`, built), `mc-h1678b` (`ui#1678` product build of `8558e813`, checked out at `632dd147`, built) and `mc-h1677c` (the base, code equal to `redesign/main`). After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. Write any helper whose redirect target is a variable with the Write tool, run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Never run `add-pr.mjs` without its four arguments (it writes a junk row). Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `cut-report.sh <worker log> <out>`; `chain-body.sh <pr> <report>...` (merges reports in order with `--ui-scope`; a report with no `## Review harness` merges with `tools/merge-review-batch-body.mjs` without it); `check-reds.sh <pr>...`; `head-build.sh <label> <sha>`; `head-spec.sh <label> <worktree label> <spec> [grep]`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then a case in `launch-rb.sh`; `ticket-files.sh`, `overlap-note.sh`, `compose-note.sh`, `launch-new.sh` for a new ticket; `add-pr.mjs <pr> '#<issue>' <worktree name> <branch>` and `mark-merged.mjs <pr> <merge sha> '#<issue>'` keep the run state; `reconcile.mjs` reconciles the board with the spec. A relaunch within 5 minutes of a launcher's exit is refused: wait it out in the same background command. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

The spec's `## Current state` carries every detail below.

1. Start one CI waiter for `ui#1673`, `ui#1678`, `ui#1679`, `ui#1680` and `ui#1681` (several `--pr` flags), and launch `#1320`, `#1321` and `#1322` at once through `gated-launch.sh` with their composed orders (worktrees and `npm ci` are ready; the `#1320` order already carries the sidebar search easing added by ticket comment).
2. `ui#1673` (`b31e2952`, pushed and proven locally, thread resolved): when it is green with an approval submitted after the push, run a full combined check of `redesign/main` plus `ui#1673` plus `ui#1653` (`d07ab3b6`, ready) whose only red is `focus-rings` Calendário (owned by `ui#1654`); merge both at their approved heads; close `#1298` and `#1293`; tear down their worktrees; then send `ui#1654` batch 1 at once with its probed reds.
3. `ui#1678` (`632dd147`, pushed, both threads resolved, nine specs proven locally): merge on green CI, a fresh approval of that head and zero threads (D115 check if behind); close `#1290`; then launch `#1318`.
4. `ui#1679`, `ui#1680` and `ui#1681`: read each review with `list-bot-threads.mjs`, answer findings with review batches, and approve `ui#1680`'s and later `#1321`'s new strings with `/second-opinion` framed as a claimed copy defect, posting the verdict before merge.
5. After `ui#1673` merges: `ui#1664` batch 6 (`note-1301-rb6.md`), launch `#1316` (`note-1316.md`), send `ui#1674` its batch. After `ui#1654` merges: `#1299`. After `ui#1664` merges: `#1306`, `#1307` and `#1317`.
6. When the Mac is idle (`ioreg -c IOHIDSystem` HIDIdleTime above 300 seconds): in the owner's Chrome window, set DevTools' dock side back to right, close the continued sweep's DevTools and its "SWEEP" tab (on staging Hoje; never an owner tab), then run the 1352 dark full probe set and the keyboard Tab traversal still owed on `aa14c594` (`sweep-order-aa14c594-cont.md`, items 3 and 4), or sweep the next released commit instead if one exists by then.
7. After 00:15 Sao Paulo (the staging pinger stops at 23:55 and the free API sleeps 15 minutes later): `ui#1669`'s staging sleep proof on `https://app-staging.useorbit.org` (the page wakes the sleeping API and loads without an error screen; record the network trail).
8. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132) to the internal track, and sweep the released commit.
9. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1673` `b31e2952` (`#1298`) | pushed after a local proof (45 of 45 twice, 3 of 3); thread resolved; CI and review pending (step 2) |
| `ui#1653` `d07ab3b6` (`#1293`) | ready; merges with `ui#1673` on a combined check (step 2) |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges (step 2) |
| `ui#1678` `632dd147` (`#1290`) | pushed after a local proof of nine specs; both threads resolved; CI and review pending (step 3) |
| `ui#1664` `c004b094` (`#1301`) | approved, conflicting; batch 6 after `ui#1673` (step 5) |
| `ui#1674` `c4eeec60` (`#1300`) | approved; batch after `ui#1673` (step 5) |
| `ui#1679` `01c7935e` (`#1319`) | new; CI and review pending (step 4) |
| `ui#1680` `fe3c86de` (`#1323`) | new; changes requested; copy approval owed (step 4) |
| `ui#1681` `ad36f0f5` (`#1324`) | new; CI and review pending (step 4) |
| `#1320`, `#1321`, `#1322` | worktrees ready with `npm ci`, orders composed, never launched (stopped at the relay gate); launch first (step 1) |
| Workers, subagents, workflows | none running |
| CI waiters | none (the relay tool stops them); start one (step 1) |
| Staging | API `86e7467c`, web `aa14c594`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1653`, `ui#1654`, `ui#1664`, `ui#1673`, `ui#1674`, `ui#1678`, `ui#1679`, `ui#1680`, `ui#1681`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
| Unpushed commits | `ticket-1242-week-grid-one-scroller`: 1 commit `40200ee4` on a branch whose `ui#1633` is closed (kept, as before); none elsewhere |
| Branches with no pull request | `fix/ticket-1320-hover-fill-transitions`, `fix/ticket-1321-anytime-label-one-line`, `fix/ticket-1322-no-break-inside-word` (no commits yet, step 1); `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept); `fix/ticket-1312-composer-hover-settled` (merged `ui#1677`, kept); the old `ticket-24`, `299`, `306`, `390`, `642`, `647`, `735`, `769` worktrees as the spec lists |
| Detached HEADs | scratch build worktrees `mc-*` in this and older scratchpads; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água; the "SWEEP" tab with DevTools docked bottom is open in his window (step 6) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits on `HEAD_MOVED` or a transient `READ_ERROR`, so restart it); read `gh run list --commit <sha>` before calling a check red (a cancelled duplicate beside a green rerun is not red); a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting (worker reports carry `/tmp` links and em dashes); after a body merge, replace every "Playwright was not run" claim the local proof answers; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A layout red that needs a cause gets a probe spec (copy a small diagnostic spec into a scratch build and log the measured boxes, `document.activeElement`, `isConnected`, console errors and page errors) before a batch is ordered; attribute a red with builds of the base with and without one head before sending it to that head. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 144 open, 144 placed, 0 unplaced (`reconcile.mjs`), 0 placed twice by placement (cross-references in a second batch remain, as before). The redesign has 18 open tickets: `#1286`, `#1290`, `#1293`, `#1298` to `#1301`, `#1306`, `#1307`, `#1316` to `#1324`. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and owner instructions: carried.
- Step 1, `ui#1678` proof and push: done. The proof found `habit-detail-spacing.spec.ts` red (the hit area counted as overflow); batch 3 (`632dd147`) fixed the spec, it passed 16 of 16 twice, both threads were resolved and the branch was pushed once. Merge is step 3.
- Step 2, `ui#1673` batch 4: done (`b31e2952`, account-scoped disclosures with four red-then-green tests, 45 of 45 twice and 3 of 3 locally, thread resolved, pushed). Merge is step 2.
- Step 3, combined check and the `ui#1673` and `ui#1653` merge, then `ui#1654` batch 1: carried (step 2); combined check r3 is superseded by a new check on `b31e2952`.
- Step 4, launch `#1319` to `#1324`: done for `#1319` (`ui#1679`), `#1323` (`ui#1680`) and `#1324` (`ui#1681`); `#1320`, `#1321` and `#1322` were stopped at the gate by the relay threshold and are carried (step 1).
- Step 5, `ui#1664` batch 6, `#1316`, `ui#1674`, `#1318`, `#1299`, `#1306`, `#1307`, `#1317`: carried (steps 3 and 5).
- Step 6, staging cleanup and the rest of the `aa14c594` sweep: done in part. Both sweep habits are deleted and the first sweep tab is closed; the continued sweep covered 600, 840 and 1100 and filed its one new finding into `#1320` by comment, then stopped when the owner came back, leaving its own tab open; the tab cleanup and the 1352 pass are carried (step 6).
- Step 7, `ui#1669`'s staging sleep proof: carried (step 7).
- Step 8, the next staging release, Orbit Staging 1.3.73 and its sweep: carried (step 8).
- Step 9, Batch R then the order: carried (step 9).

Every identifier here came from a previous session: treat each as a lead to verify.
