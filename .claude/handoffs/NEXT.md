/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.


## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, layout logs, local spec logs `hs-*.log`, the combined check folders `check-r1` and `check-r2`, `note-1301-rb6.md`, `note-1316.md`, `lead-544-580.md`, `prev-sleep-decisions-*.md` and the decision log) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it skips the scratch build worktrees (`base`, `mc-*`) and links `base` to an older session's `mc-p3` (tree `aa090a9f`, now stale: build a fresh base of `redesign/main` for any red-on-base proof). After the carry, check `grep -n "^SP=" mc-prep.sh mc-check.sh` names the new scratchpad. The predecessor's own scratchpad (session id starting `149c2d17`, beside the new one in the system temporary directory) holds live builds: `mc-h1677c` (base `858d3b5a` plus `ui#1677`, effectively a base build for anything outside the composer hover test), `mc-t3` (base plus `ui#1673` plus `ui#1654`), and symlinks `mc-r2` and `mc-h1678` into the older `b7b9c852` scratchpad (`mc-h1678` holds a probe-edited `row-geometry.spec.ts`; restore it with `git checkout` before reuse). `run-sheettitle.sh` was still running at the relay: read `hs-st-base1..3.log` and `hs-st-r2-1..3.log` there. Write any helper whose redirect target is a variable with the Write tool, run scratchpad scripts after a `cd` into the scratchpad, and use `bash` loops in a script file. Never put `rm -rf` of the Playwright lock after a `;` in a command that may not own the lock. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `cut-report.sh`; `batch-merge-body.sh <pr> <report> <sha prefix> [--ui-scope]`; `lg-cases.sh`; `err-blocks.sh`; `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `base-delta-overlap.sh`; `diag-head.sh <label> <head sha> <spec>`; `head-spec.sh <label> <worktree label> <spec> [grep]` (loop it in a script for repeats); `layout-only.sh <worktree> <label>` (only the layout step of a combined check); `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>`; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then a case in `launch-rb.sh`; `ticket-files.sh`, `overlap-note.sh`, `compose-note.sh`, `launch-new.sh` for a new ticket; `add-pr.mjs` and `mark-merged.mjs <pr> <merge sha> '#<issue>'` keep the run state; `reconcile.mjs` reconciles the board with the spec. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

The spec's `## Current state` carries every detail below (the r2 reds with their owners, the merge plan for the three calendar focus pull requests, and the `ui#1678` batch content).

1. Settle the r2 reds that still lack an owner: read the `run-sheettitle.sh` logs (sheet title text scale 2 on base versus r2); run `calendar-grid-column.spec.ts` loading=true three times on a base build (`mc-h1677c` serves); probe `ui#1653`'s `selected-focus-one-indicator.spec.ts` DateField today `keyboardFocus` race. Send `ui#1653` a review batch for its own race if it reproduces, a batch to whichever pull request owns each other red, and file a ticket for a red that is on the base.
2. `ui#1677` (`3d527052`, proven 5 of 5 plus 5 light runs on base `858d3b5a`): on a fresh Pullfrog approval of that head and green CI, merge and close `#1312`.
3. `ui#1678` (`#1290`): compose and send the one review batch the spec lists (two P2 threads, two spec corrections, three product fixes, with a base merge), then the red-on-base and green-on-head proof of its five changed specs, CI, approval, a full combined check, merge.
4. When the only r2 red left is `focus-rings` Calendário: merge `ui#1673` at `34cc1354` and `ui#1653` at `dcf6b792` at their approved heads on that combined check (log that red as owned by `ui#1654`), close `#1298` and `#1293`, tear down their worktrees, then send `ui#1654` batch 1 at once with its probed reds.
5. After `ui#1673` merges: `ui#1664` batch 6 (`note-1301-rb6.md`), launch `#1316` with `note-1316.md`, send `ui#1674` its batch. After `ui#1654` merges: `#1299`. After `ui#1664` merges: `#1306` and `#1307`.
6. Dependabot `ui#1638`, `ui#1646`, `ui#1647` on `main`: once rebased (heads `4ba82138`, `1d43a6c7`, `925271ae` after the rebase request), merge each on green CI and its approval.
7. After this merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), run `ui#1669`'s staging sleep proof, and sweep the released commit with `sweep-order-1684ecee.md` retargeted; measure the 544 versus 580 content edge lead (`lead-544-580.md`) before filing it.
8. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1673` `34cc1354` (`#1298`) | approved, 0 threads, CI red only on `focus-rings` Calendário (owned by `ui#1654`); merge per step 4 |
| `ui#1653` `dcf6b792` (`#1293`) | approved, 0 threads, CI was running; its own DateField race to settle (step 1), merge per step 4 |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting, own reds reproduced on `mc-t3`; batch 1 after `ui#1653` merges (step 4) |
| `ui#1677` `3d527052` (`#1312`) | proven; waits for a fresh approval and CI (step 2) |
| `ui#1678` `0e64759d` (`#1290`) | two P2 threads, red `row-geometry.spec.ts`; review batch (step 3) |
| `ui#1664` `c004b094` (`#1301`) | approved; batch 6 after `ui#1673` (step 5) |
| `ui#1674` `c4eeec60` (`#1300`) | batch after `ui#1673` (step 5) |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | rebase requested; merge on green (step 6) |
| Workers, subagents, workflows | none running |
| Local checks | `run-sheettitle.sh` was running in the predecessor scratchpad (step 1) |
| CI waiters | none after the relay (the relay tool stops them); start new ones |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1646`, `ui#1647`, `ui#1653`, `ui#1654`, `ui#1664`, `ui#1673`, `ui#1674`, `ui#1677`, `ui#1678`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; the `#1290` worktree is clean at `0e64759d` |
| Unpushed commits | none: every open pull request branch is pushed at the head above |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept); merged tickets' local branches kept by the teardown tool |
| Detached HEADs | scratch build worktrees `mc-*` in this and older scratchpads; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags; a waiter exits on `HEAD_MOVED` or a transient `READ_ERROR`, so restart it); read `gh run list --commit <sha>` before calling a check red (a cancelled duplicate beside a green rerun is not red); a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. A layout red that needs a cause gets a probe spec (copy a small diagnostic spec into a scratch build and log `document.activeElement`, `isConnected`, console errors and page errors) before a batch is ordered. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.


## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 137 open, 137 placed, 0 unplaced (`reconcile.mjs`), 0 placed twice by placement (ten open tickets, `#28`, `#179`, `#196`, `#237`, `#238`, `#385`, `#394`, `#418`, `#556`, `#746`, are also mentioned in a second batch as cross-references). The redesign has 11 open tickets: `#1286`, `#1290`, `#1293`, `#1298` to `#1301`, `#1306`, `#1307`, `#1312`, `#1316`. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried; the live builds now sit in the `149c2d17` scratchpad, and `layout-only.sh` joins the helpers.
- Step 1, combined check r2 and the pair merge: superseded. r2 finished with 6 reds, and the pairing proof was false: `ui#1653` does not fix `ui#1673`'s `focus-rings` red, `ui#1654` does (`mc-t3`). The new merge plan is in the spec's Current state and steps 1 and 4 above. `ui#1676` merged (`858d3b5a`) on its own bar and `#1315` is closed.
- Step 2, `ui#1677` rerun: done (5 of 5, then 5 light runs of 3 of 3 on base `858d3b5a` plus `3d527052`); the approval and merge are carried (step 2).
- Step 3, `ui#1678` batch: carried (step 3), now with the full finding list from probes rg3 and rg4.
- Step 4, `ui#1664` batch 6, `#1316` and `ui#1674` after `ui#1673`: carried (step 5); `note-1301-rb6.md` is written.
- Step 5, `ui#1654` batch 1 after `ui#1653`, then `#1299`, and `#1306`, `#1307` after `ui#1664`: carried (steps 4 and 5).
- Step 6, release, Orbit Staging 1.3.73, staging proof and sweep: carried (step 7).
- Step 7, Batch R then the order: carried (step 8).
- Dependabot pull requests "later batch": superseded by the rebase request and step 6.

Every identifier here came from a previous session: treat each as a lead to verify.
