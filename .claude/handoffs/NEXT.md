/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, `diag1653/findings.md`, `diag1652b/findings.md`, `probe-sleep-429/`, the decision log) is in the system temporary directory under the previous session's id; its durable copy is `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, or copy it from the old scratchpad with a carry script modelled on `carry-in.sh` there (it links the scratch build worktrees `base`, `mc-*` instead of copying them). Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad.

## Then: the in-flight work, in this order

1. `#1308` (the owner's staging 429 report, client side): launch it first. It lands on `redesign/main`.
2. The 429's source: reproduce it with the owner's session in Chrome while both staging services sleep, per the `## Current state` bullet, and file one ticket per source found. The wake hypothesis is already falsified by `probe-sleep-429`.
3. Merge on green: `ui#1632` and `ui#1657` (each had one flake job rerun; both passed combined check k1), `ui#1658` after CI, Pullfrog and an NDK cache run, `ui#1645` after CI and a fresh approval of `e105d104`.
4. Relaunch `#1260` with the decision comment on the ticket, and launch `ui#1659`'s batch (`order-1288rb.md`, refused by the relay drain).
5. `ui#1653` review batch 2 from `diag1653/findings.md`; `ui#1652` review batch 2 from `diag1652b/findings.md` (base merge first). Then `ui#1654` batch 1 after `ui#1653` merges.
6. `ui#1660`: run `chain-1660.sh` (red on base, green on head), then CI, Pullfrog, merge. `ui#1661`: prove its layout guards red and green, then CI, Pullfrog, merge.
7. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit; verify the 544 versus 580 content edge lead before filing.
8. Launch as slots free, in the order of the `## Current state` launch line.
9. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| Owner staging report: 429 on Novo hábito and Hoje | `#1308` filed (client handling); source unknown, repro next (steps 1 and 2) |
| `ui#1632` `5652d5c5` (`#1282`) | approved, k1 passed, flake job rerun (`#1306`); merge on green |
| `ui#1645` `e105d104` (`#1256`) | review batch 1 pushed with body; CI, fresh approval, merge |
| `ui#1652` `64e10a32` plus unpushed `05a91669` (`#1294`) | conflicting with base; batch 2 from `diag1652b/findings.md` |
| `ui#1653` `de543253` (`#1293`) | red head; batch 2 from `diag1653/findings.md`, valid red proof, two P2 threads |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` |
| `ui#1657` `176be0a5` (`#1302`) | approved, k1 passed, flake job rerun (`#1307`); merge on green |
| `ui#1658` `85710b67` (`#1304`) | sdkmanager path fix pushed; CI, Pullfrog, cache run, merge |
| `ui#1659` `af3d3b8f` (`#1288`) | conflicting; batch 1 composed (base merge plus `#1305`), launch it |
| `ui#1660` `2ba7d759` (`#1239`) | opened; run `chain-1660.sh`, CI, Pullfrog, merge |
| `ui#1661` `2140836e` (`#1295`) | opened; prove its layout guards, CI, Pullfrog, merge |
| `#1260` branch `ee7544ea`, no pull request | stopped on a decision, decided on the ticket; relaunch |
| `ui#1655` (`#1291`) | merged as `552a8579`; ticket closed, worktree torn down |
| `ui#1656` (`#1304` on `main`) | closed: `main` has no Android build workflow; branch kept |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| New tickets this session | `#1306`, `#1307` (harness flakes), `#1308` (owner report), all placed in Batch R |
| Workers, subagents | none running (drained for the relay) |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1638`, `ui#1645` to `ui#1647`, `ui#1652` to `ui#1654`, `ui#1657` to `ui#1661`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or any ticket worktree |
| Unpushed commits | `ticket-1294-semana-week-view` (`05a91669`), `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it) |
| Branches with no pull request | `fix/ticket-1260-subscreen-row-chevrons` (relaunch opens it), `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept) |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. Ticket comments go through `tools/comment-ticket.mjs`, never raw `gh issue comment`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the 24 open redesign tickets listed in `## Current state`, plus `#1304` to `#1307` and every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 154 open, 154 placed, 0 unplaced (`reconcile.mjs`; `#1306`, `#1307` and `#1308` placed in Batch R this session), no new double placement (10 tickets are mentioned in a second batch as cross references, unchanged). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: superseded (this is a relay successor; restore from the durable copy, now refreshed).
- First, the owner's staging report: partly done. The API rate limit lead does not hold (no rejection logged, signed-in calls partition by user, the API slept); the client defect is `#1308`; the source repro is carried (steps 1 and 2).
- Step 1, read the three worker worktrees: done (`#1239` opened `ui#1660`, `#1288` opened `ui#1659`, `#1295` opened `ui#1661`, after relaunches for `#1239` and `#1295`).
- Step 2, `ui#1653` proof and threads: done as a diagnosis (head red; `diag1653/findings.md`); batch 2 carried (step 5). `ui#1654` batch 1: carried (step 5).
- Step 3, `ui#1652`: diagnosis done (`diag1652b/findings.md`); batch 2 carried (step 5).
- Step 4, `ui#1645` duplication batch: done through the push (`e105d104`); merge carried (step 3).
- Step 5, `ui#1632`, `ui#1655`, `ui#1657`, `ui#1658`: `ui#1655` merged (`552a8579`); the other three carried (step 3).
- Step 6, `#1305` joins `#1288`'s pull request: composed in `order-1288rb.md`; launch carried (step 4).
- Step 7, release, Orbit Staging 1.3.73 and sweep: carried (step 7).
- Step 8, launches: `#1260` launched (stopped on a decision, carried in step 4); the rest carried (step 8).
- Step 9, Batch R in the spec's order: carried (step 9).

Every identifier here came from a previous session: treat each as a lead to verify.
