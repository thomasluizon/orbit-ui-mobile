/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, layout logs `lg-*.log`, `touchprobe/`, `proof-1664.out`, `diag1653/findings.md`, `probe-bff-wake/`, the decision log) is in the system temporary directory under the previous session's id; its durable copy is `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`; link the scratch build worktree `base` into the new scratchpad (`ln -s`) rather than copying it, and never copy a `mc-*` directory. Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad. `log-decision.sh` appends stdin to the decision log; `cut-report.sh <worker log> <out>` cuts a worker's final report; `batch-merge-body.sh <pr> <report> <sha prefix> --ui-scope` merges a batch report into a pull request body and flags dashes and machine paths (the report's first line must read ``Committed `<sha>``); `fails.sh <gh --log-failed file> [skip pattern]` prints each failing layout case with its error; `check-reds.sh <pr>...` lists failed jobs with annotations; `ready.sh <since-ref> <pr>...` checks the merge bar; `compose-rb.sh <issue> <worktree> <round>` composes a review batch from `note-<issue>-<round>.md`; `launch-rb.sh <label>` and `launch-new.sh <n> <worktree>` gated-launch them; `compose-note.sh <n> <worktree>` creates a ticket worktree and order. The macOS shell has no `timeout` command: start waiters without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

1. Start CI waiters (at most three, several `--pr` flags each) for `ui#1652`, `ui#1653`, `ui#1659` to `ui#1667`.
2. Read `ui#1664`'s full Layout Guard run (37894248624, or the latest on `da20df2c`), then compose and launch its one batch: every spec that browser-routes server-prefetched data serves it to the server render instead.
3. Merge on the bar as each head has green checks (filed races named: keycap `#1311`, AbortError `#1306`, Agenda hover read `#1307`, composer hover `#1312`), a Pullfrog approval submitted after its push and zero threads: `ui#1658` (ready now), `ui#1660`, `ui#1663`, `ui#1665`, `ui#1666`, with one combined forced type check (`c-build.sh`) or a full combined check where files overlap. Close each ticket with `tools/complete-ticket.mjs` and tear down its worktree.
4. For the pushed batches, prove changed layout cases red on a base build and green on the head before merging (one hermetic Playwright run at a time): `ui#1661` (the new Calendário inset case on a build of `b1e5ab78`), `ui#1659` (`calendar-period-header`, `press-shape`, `calendar-agenda-time-tone`), `ui#1653` (the cases its body lists), `ui#1662` (`profile-subscreen-rows.spec.ts`), `ui#1667` (the keycap spec five times in light on its head). Then fresh approvals and merges for `ui#1652`, `ui#1653`, `ui#1659`, `ui#1661`, `ui#1662`, `ui#1667`.
5. `#1309` launches after `ui#1663` merges; `ui#1654` batch 1 after `ui#1653` merges.
6. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit; verify the 544 versus 580 content edge lead before filing.
7. Launch as slots free, in the order of the `## Current state` launch line, then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1652` `926bce5e` (`#1294`) | batch 3 pushed, thread resolved; CI, Semana specs, copy verdict, combined check, fresh approval, merge |
| `ui#1653` `d3f4ab27` (`#1293`) | pushed, P1 thread resolved; red proofs, CI, fresh approval, merge |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges |
| `ui#1658` `62c4fb8c` (`#1304`) | ready (NDK condition met, approved, 0 threads); merge on the next combined check |
| `ui#1659` `3c8d3166` (`#1288`, `#1305`) | batch 3 pushed; red proofs, CI, fresh approval, merge |
| `ui#1660` `75d1a4da` (`#1239`) | approved; reds are filed races; merge on the bar |
| `ui#1661` `86a2607a` (`#1295`) | batch 2 pushed; Calendário red proof, CI, fresh approval, merge |
| `ui#1662` `c46f7bf7` (`#1260`) | batch 1 pushed, thread resolved; red proof, CI, SonarCloud, fresh approval, merge |
| `ui#1663` `8354e122` (`#1308`) | approved; Layout Guard rerun requested (reds were `#1311` and `#1306`); merge on the bar; then `#1309` |
| `ui#1664` `da20df2c` (`#1301`) | compose its batch after reading the full Layout Guard run |
| `ui#1665` `af75fac6` (`#1310`), `ui#1666` `595a6d40` (`#1218`) | approved; reds are filed races, other failures were concurrency cancellations; merge on the bar |
| `ui#1667` `96f075b1` (`#1311`) | opened by its worker: light profiles no longer paint dark first; red proof, CI, review, merge |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| New tickets this session | `#1311` (keycap race, became the dark-first fix), `#1312` (composer hover race, blocked by `#1295`), both placed in Batch R |
| Workers, subagents, waiters | none running (drained for the relay) |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1646`, `ui#1647`, `ui#1652` to `ui#1654`, `ui#1658` to `ui#1667`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or any ticket worktree |
| Unpushed commits | `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it) |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept) |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. Ticket comments go through `tools/comment-ticket.mjs` and closing through `tools/complete-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 22 open redesign tickets listed in `## Current state`, plus `#1304`, `#1305`, `#1306`, `#1307`, `#1310`, `#1311`, `#1312` and every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 155 open, 155 placed, 0 unplaced (`reconcile.mjs`), no new double placement. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried, with the base link, no `mc-*` copy and the new helpers named.
- Step 1, CI waiters for `ui#1652`, `ui#1658` to `ui#1666`: done (waiters ran; `ui#1658` settled green, the rest carried in step 1 with `ui#1653` and `ui#1667` added).
- Step 2, relaunch the `ui#1653` continuation: done (the worker's NEEDS_DECISION answered from the drawing, pushed `d3f4ab27`, thread resolved); proofs and merge carried (step 4).
- Step 3, the `ui#1652`, `ui#1662`, `ui#1661` and `ui#1664` batches: `ui#1652` batch 3 done (`926bce5e`), `ui#1662` batch 1 done (`c46f7bf7`), `ui#1661` batch 2 done (`86a2607a`); `ui#1664` carried (step 2).
- Step 4, file and launch the keycap race: done (`#1311`, opened `ui#1667`).
- Step 5, merges: not yet (no head met the bar before the relay except `ui#1658`); carried (step 3). `ui#1659` needed batch 3 (done, `3c8d3166`).
- Step 6, `#1309` after `ui#1663` merges: carried (step 5).
- Step 7, release, Orbit Staging 1.3.73 and sweep: carried (step 6).
- Step 8, launches: carried (step 7).

Every identifier here came from a previous session: treat each as a lead to verify.
