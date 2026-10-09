/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, `diag1653/findings.md`, `diag1652b/findings.md`, `probe-bff-wake/`, the decision log) is in the system temporary directory under the previous session's id; its durable copy is `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`; the scratch build worktree `base` is registered under an older session's scratchpad, so link it into the new scratchpad (`ln -s`) rather than copying it, and never copy a `mc-*` directory (each is a multi-gigabyte worktree). Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad. `log-decision.sh` appends stdin to the decision log; `cut-report.sh <worker log> <out>` cuts a worker's final report.

## Then: the in-flight work, in this order

1. Relaunch `#1308` (branch `fix/ticket-1308-read-429-retry`, three unpushed commits) with `--relaunch-reason`, `--hard-ceiling-minutes 75` and a continuation order: verify the web, mobile and shared suites, fix what is red (`use-habits.test.ts` "handles fetch error" was red), push, open the pull request on `redesign/main`.
2. Relaunch `#1260` (branch `fix/ticket-1260-subscreen-row-chevrons`, `ee7544ea` pushed plus three unpushed commits) the same way, with the decision comment on the ticket.
3. Launch the composed batches: `ui#1653` batch 2 (`order-1293-rb2.md`, `launch-rb2.sh 1293`), then `ui#1659` batch 2 for thread `PRRT_kwDOR5Siws6qo0wu` (the Agenda row outcome in the screen reader name, web and Android; batch 1 `434d157e` is committed and unpushed, push both together), then `ui#1658` batch 1 (`note-1304-rb1.md`, one NDK version for every Gradle subproject).
4. Drive `ui#1652` (`8903da1b`) and `ui#1661` (`b1e5ab78`), both pushed with threads resolved: CI, Pullfrog at that head, the layout proofs named in `## Current state`, merge on the bar. Drive `ui#1645` (`e105d104`): CI, fresh approval, merge. Run `chain-1660b.sh` for `ui#1660`, then merge on the bar.
5. `#1309` (the 429's source, Render refusing a Render-internal wake) launches after `#1308`'s pull request merges.
6. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit; verify the 544 versus 580 content edge lead before filing.
7. Launch as slots free, in the order of the `## Current state` launch line.
8. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| Owner staging report: 429 on Novo hábito and Hoje | client fix `#1308` (worker branch, relaunch), source found and filed as `#1309` |
| `ui#1632` (`#1282`) | merged `e0127e18`; ticket closed, worktree torn down |
| `ui#1657` (`#1302`) | merged `4dfdb853`; ticket closed, worktree torn down |
| `ui#1645` `e105d104` (`#1256`) | CI, fresh approval, merge |
| `ui#1652` `8903da1b` (`#1294`) | batches 1 and 2 pushed, threads resolved; CI, layout specs, Pullfrog, copy verdict, merge check |
| `ui#1653` `de543253` (`#1293`) | red, one P1 thread; batch 2 composed, launch |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges |
| `ui#1658` `85710b67` (`#1304`) | green and approved, do not merge: Gradle still downloads NDK 27.0; batch 1 written |
| `ui#1659` `af3d3b8f` (`#1288`) | batch 1 committed unpushed (`dcab271b`, `434d157e`); batch 2 for the open P2 thread, then push |
| `ui#1660` `2ba7d759` (`#1239`) | approved; `chain-1660b.sh` proof, merge |
| `ui#1661` `b1e5ab78` (`#1295`) | batch 1 pushed, threads resolved; CI, Pullfrog, layout proof, merge |
| `#1308` branch `dddc84b8`, no pull request | killed at the 45 minute ceiling; relaunch |
| `#1260` branch `cda8a88a`, no pull request | killed at the 45 minute ceiling; relaunch |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| New tickets this session | `#1309` (429 source), `#1310` (harness flake, filed by the `#1260` worker), both placed in Batch R |
| Workers, subagents, waiters | none running (drained for the relay) |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1645` to `ui#1647`, `ui#1652` to `ui#1654`, `ui#1658` to `ui#1661`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or any ticket worktree |
| Unpushed commits | `ticket-1288-agenda-rebuild` (batch 1), `ticket-1308-read-429-retry` (3, no upstream), `ticket-1260-subscreen-row-chevrons` (3, no upstream), `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it) |
| Branches with no pull request | `fix/ticket-1308-read-429-retry`, `fix/ticket-1260-subscreen-row-chevrons` (relaunches open them), `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept) |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. Ticket comments go through `tools/comment-ticket.mjs`, never raw `gh issue comment`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 23 open redesign tickets listed in `## Current state`, plus `#1304`, `#1306`, `#1307`, `#1310` and every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 154 open, 154 placed, 0 unplaced (`reconcile.mjs`; `#1309` and `#1310` placed in Batch R this session), no new double placement. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried (the D143 ADR added to the reading list, because `#1309` rests on its free staging).
- Entry point and carry step: carried, with the base link and no `mc-*` copy.
- Step 1, launch `#1308`: done (launched; killed at the ceiling with commits); relaunch carried (step 1).
- Step 2, the 429's source repro: done (`probe-bff-wake/summary.txt`, filed as `#1309`); launch carried (step 5).
- Step 3, merges: `ui#1632` and `ui#1657` done (merged); `ui#1658` superseded by the NDK finding (step 3); `ui#1645` carried (step 4).
- Step 4, relaunch `#1260` and launch `ui#1659`'s batch: done (both launched); `#1260` relaunch carried (step 2); `ui#1659` batch 2 carried (step 3).
- Step 5, `ui#1653` batch 2 and `ui#1652` batch 2: `ui#1652` done (pushed `8903da1b`), its proofs carried (step 4); `ui#1653` composed, launch carried (step 3); `ui#1654` carried (Current state).
- Step 6, `ui#1660` proof and `ui#1661` guards: `ui#1661` batch 1 done (pushed `b1e5ab78`), proofs carried (step 4); `ui#1660` carried (step 4).
- Step 7, release, Orbit Staging 1.3.73 and sweep: carried (step 6).
- Step 8, launches: carried (step 7).
- Step 9, Batch R in the spec's order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
