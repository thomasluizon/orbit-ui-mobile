/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, layout logs `lg-*.log` and `lgx-*.log`, red proof logs `red-*.log`, `touchprobe/`, `diag1653/findings.md`, `probe-bff-wake/`, the decision log) is in the system temporary directory under the previous session's id; its durable copy is `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it skips the scratch build worktrees (`base`, `mc-*`) and links `base` (built at `9109a2aa`). The full combined check `cB1` was still in its layout project at handoff: read `check-cB1/summary.txt` in the PREDECESSOR scratchpad, not the durable copy. Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad. `log-decision.sh` appends stdin to the decision log and replaces `@NOW` with the clock time (write every entry header as `## D<n> @NOW ...`); `cut-report.sh <worker log> <out>` cuts a worker's final report; `batch-merge-body.sh <pr> <report> <sha prefix> [--ui-scope]` merges a batch report into a pull request body and flags dashes and machine paths (the report's first line must read ``Committed `<sha>``; pass `--ui-scope` only when a changed path matches the UI review sweep scope); `fails.sh <log> [skip pattern]` prints each failing layout case with its error; `lg-cases.sh <label> <run id>` saves a run's failed log and lists its failing cases; `check-reds.sh <pr>...` lists failed jobs with annotations; `ready.sh <since-ref> <pr>...` checks the merge bar; `pr-overlap.sh <ticket>...` lists a ticket's file overlaps with open pull requests; `red-sha.sh <label> <head sha> <helpers|-> <spec>... [-- <grep>]` proves specs red on the base build (`RED_BASE=<worktree>` targets another build); `head-build.sh <label> <sha>`, `repeat-spec.sh` and `c-build.sh` build and check; `mc-check.sh` runs the full combined check; `compose-rb.sh <issue> <worktree> <round>` composes a review batch from `note-<issue>-<round>.md`; `launch-rb.sh <label>` and `launch-new.sh <n> <worktree>` gated-launch them; `compose-note.sh <n> <worktree>` creates a ticket worktree and order; `overlap-note.sh` writes an overlap note; `add-pr.mjs` and `mark-merged.mjs` keep the run state. The macOS shell has no `timeout` command: start waiters without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

1. Start CI waiters (at most three, several `--pr` flags each) for `ui#1652`, `ui#1653`, `ui#1659`, `ui#1661`, `ui#1662`, `ui#1664`, `ui#1667` to `ui#1671`.
2. `ui#1659`: read `check-cB1/summary.txt`; if every step exits 0 (layout reds only the filed races), merge it at `3c8d3166` and close `#1288` and `#1305` with `tools/complete-ticket.mjs`.
3. Compose and launch review batches (one per pull request, the spec's Current state names each fix): `ui#1661` batch 3 (the `profile-top-inset.spec.ts:30` null column), `ui#1664` batch 2 (nine Hoje row reds), `ui#1667` batch 1 (the P1 render-time session refresh thread), `ui#1653` (the stale `sonar-project.properties` entry), `ui#1668` (read its requested changes first), and after `ui#1659` merges a mechanical base-merge order for `ui#1662` (conflict in `list-row.tsx`).
4. `ui#1652`: classify `calendar-week-pattern.spec.ts:40` at pt-BR 840x726 with a repeated run on a head build; a race goes back to its worker as a batch, a pass merges on the bar.
5. For `ui#1668` to `ui#1671`: wait for CI, prove each changed layout case red on a base build, clear Pullfrog, merge on the bar. Close each ticket with `tools/complete-ticket.mjs` and tear down its worktree with `tools/teardown-worktree.mjs`.
6. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit; verify the 544 versus 580 content edge lead before filing (the web Perfil frame caps 560 including its 16 inline padding, while the wide drawing caps the content box at 560 and the compact drawing has no cap), and run `ui#1669`'s staging sleep proof.
7. Launch as slots free, in the order of the `## Current state` launch line, then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1652` `926bce5e` (`#1294`) | approved, 0 threads, copy verdict posted; one own red to classify (step 4), then merge |
| `ui#1653` `d3f4ab27` (`#1293`) | approved, red half proven (57 cases); Sonar Paths red, batch (step 3) |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges |
| `ui#1659` `3c8d3166` (`#1288`, `#1305`) | approved, red half proven; merge on `cB1` (step 2) |
| `ui#1661` `86a2607a` (`#1295`) | approved; own new case red on its head, batch 3 (step 3) |
| `ui#1662` `c46f7bf7` (`#1260`) | approved, red half proven; base merge after `ui#1659` (step 3) |
| `ui#1664` `8b36f2f3` (`#1301`) | batch 1 pushed (111 reds down to 13); batch 2 for nine own reds (step 3) |
| `ui#1667` `96f075b1` (`#1311`) | keycap light cases 61 of 61 on its head; CHANGES_REQUESTED, one P1 thread, batch 1 (step 3) |
| `ui#1668` `2ce35f95` (`#1234`) | opened this session; CHANGES_REQUESTED; batch (step 3) |
| `ui#1669` `060da1e2` (`#1309`), `ui#1670` `8f172d56` (`#1267`), `ui#1671` `205823a4` (`#1246`) | opened this session; CI, red proofs, review, merge (step 5) |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| New tickets this session | `#1313` (long habit menu sheet test under parallel load, harness), placed in Batch R |
| Workers, subagents, waiters | none running (drained for the relay); local check `cB1` may still be running |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1646`, `ui#1647`, `ui#1652` to `ui#1654`, `ui#1659`, `ui#1661`, `ui#1662`, `ui#1664`, `ui#1667` to `ui#1671`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts or any ticket worktree |
| Unpushed commits | `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it) |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept); the merged tickets' local branches kept by the teardown tool |
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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 151 open, 151 placed, 0 unplaced (`reconcile.mjs`), no new double placement. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried; the carry script now skips `base` and `mc-*` itself, and new helpers are named.
- Step 1, CI waiters: done (three waiters ran to their ceilings; results recorded per pull request), carried for the new heads.
- Step 2, the `ui#1664` batch: done (batch 1 pushed `8b36f2f3`, 111 reds down to 13); batch 2 carried (step 3).
- Step 3, merges: done for `ui#1658`, `ui#1660`, `ui#1663`, `ui#1665`, `ui#1666` (combined check m5; tickets `#1304`, `#1239`, `#1308`, `#1310`, `#1218` closed, worktrees torn down).
- Step 4, red proofs: done for `ui#1653`, `ui#1659`, `ui#1662`, `ui#1661` (new case, on `b1e5ab78`) and `ui#1667` (five light runs); `ui#1652`'s Semana specs ran in CI and left one own red (step 4). Fresh approvals and merges carried (steps 2 to 5).
- Step 5, `#1309` after `ui#1663` and `ui#1654` after `ui#1653`: `#1309` done (`ui#1669`); `ui#1654` carried.
- Step 6, release, Orbit Staging 1.3.73 and sweep: carried (step 6).
- Step 7, launches: done for `#1309`, `#1267`, `#1246`, `#1234`; the rest carried (step 7).

Every identifier here came from a previous session: treat each as a lead to verify.
