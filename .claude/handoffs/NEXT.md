/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, `touchprobe/`, `proof-1664.out`, `diag1653/findings.md`, `probe-bff-wake/`, the decision log) is in the system temporary directory under the previous session's id; its durable copy is `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`; link the scratch build worktree `base` into the new scratchpad (`ln -s`) rather than copying it, and never copy a `mc-*` directory. Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad. `log-decision.sh` appends stdin to the decision log; `cut-report.sh <worker log> <out>` cuts a worker's final report; `launch-new.sh <n> <worktree name>` installs and gated-launches a fresh ticket from `order-<n>.md`; `new-ticket-wt.sh <n> <name>` creates the worktree; `launch-batch.sh` and `launch-cont.sh` hold the batch launch lines.

## Then: the in-flight work, in this order

1. Start CI waiters (at most three, several `--pr` flags each) for `ui#1652`, `ui#1658` to `ui#1666`.
2. Relaunch the `ui#1653` continuation (`#1293`, two unpushed commits `b3fbefd6`, `d48d556d`) with `--relaunch-reason` and `--hard-ceiling-minutes 75`: finish items 6 to 8 of `order-1293-rb2.md`, verify, stop without pushing; then the orchestrator's proofs, thread reply, one push.
3. Read Pullfrog's open threads on `ui#1652` and `ui#1662`, then compose and launch their batches; compose `ui#1661` batch 2 for its four red layout specs; compose the `ui#1664` batch after reading its full Layout Guard run.
4. File the `sidebar-search-keycap.spec.ts` light-theme race as a harness ticket (Batch R) and launch it; until it merges, a light-only red at its line 64 is that race, not the pull request.
5. Merge on the bar as each head turns green with a fresh approval and zero threads: `ui#1659`, `ui#1660`, `ui#1663`, `ui#1665`, `ui#1666`, then `ui#1658` once its Android Build log shows no Gradle NDK install. Close each ticket with `tools/complete-ticket.mjs` and tear down its worktree.
6. `#1309` launches after `ui#1663` merges.
7. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit; verify the 544 versus 580 content edge lead before filing.
8. Launch as slots free, in the order of the `## Current state` launch line, then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1645` (`#1256`) | merged `898193e9`; ticket completed, worktree torn down |
| `ui#1652` `8903da1b` (`#1294`) | one open thread; compose batch 3, then proofs and merge |
| `ui#1653` `de543253` (`#1293`) | batch 2 ceiling-killed with `b3fbefd6`, `d48d556d` unpushed; relaunch continuation |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges |
| `ui#1658` `62c4fb8c` (`#1304`) | batch 1 pushed; CI must show no Gradle NDK install, then a cache-restored rerun |
| `ui#1659` `ee267ee1` (`#1288`, `#1305`) | pushed, thread resolved, header case red-proven; CI green half, fresh approval, merge |
| `ui#1660` `75d1a4da` (`#1239`) | batch 1 pushed; Linux CI, fresh approval, merge |
| `ui#1661` `b1e5ab78` (`#1295`) | approved, 14 own layout reds in 4 specs; compose batch 2 |
| `ui#1662` `1c770011` (`#1260`) | one open thread, SonarCloud and `compact-settings-rows.spec.ts` red; compose batch 1 |
| `ui#1663` `8354e122` (`#1308`) | opened, every suite green; CI, review, merge; then launch `#1309` |
| `ui#1664` `da20df2c` (`#1301`) | guard red-proven; compose the batch for specs that lose browser-routed data |
| `ui#1665` `af75fac6` (`#1310`) | opened, two full web runs green; CI, review, merge |
| `ui#1666` `595a6d40` (`#1218`) | opened, every suite green; CI, review, merge |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| New tickets this session | none filed; the keycap race is to be filed (step 4) |
| Workers, subagents, waiters | none running (drained for the relay) |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1646`, `ui#1647`, `ui#1652` to `ui#1654`, `ui#1658` to `ui#1666`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or any ticket worktree |
| Unpushed commits | `ticket-1293-selected-focus-one-indicator` (2, see above), `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it) |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept) |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. Ticket comments go through `tools/comment-ticket.mjs` and closing through `tools/complete-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 22 open redesign tickets listed in `## Current state`, plus `#1304`, `#1305`, `#1306`, `#1307`, `#1310`, the keycap race ticket and every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 153 open, 153 placed, 0 unplaced (`reconcile.mjs`), no new double placement. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried, with the base link and no `mc-*` copy.
- Step 1, relaunch `#1308`: done (`ui#1663` opened, every suite green); its merge carried (step 5).
- Step 2, relaunch `#1260`: done (`ui#1662` opened, copy verdict posted); its batch carried (step 3).
- Step 3, the composed batches: `ui#1659` batch 2 done (pushed `ee267ee1`, thread resolved); `ui#1658` batch 1 done (pushed `62c4fb8c`); `ui#1653` batch 2 ceiling-killed, continuation carried (step 2).
- Step 4, drive `ui#1652`, `ui#1661`, `ui#1645`, `ui#1660`: `ui#1645` done (merged `898193e9`); `ui#1660` proof chain done and its Linux red fixed (pushed `75d1a4da`), merge carried (step 5); `ui#1652` and `ui#1661` carried (step 3).
- Step 5, `#1309` after `#1308` merges: carried (step 6).
- Step 6, release, Orbit Staging 1.3.73 and sweep: carried (step 7).
- Step 7, launches: `#1218` (`ui#1666`), `#1301` (`ui#1664`) and `#1310` (`ui#1665`) done; the rest carried (step 8).
- Step 8, Batch R in the spec's order: carried (step 8).

Every identifier here came from a previous session: treat each as a lead to verify.
