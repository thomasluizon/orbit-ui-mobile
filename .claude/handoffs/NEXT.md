/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, layout logs `lgx-*.log`, local spec logs `hs-*.log`, the combined check folders `check-r1` and `check-r2`, `proofs.md`, `lead-544-580.md`, `prev-sleep-decisions-*.md` and the decision log) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it skips the scratch build worktrees (`base`, `mc-*`) and links `base` to an older session's `mc-p3`, a web build whose tree equals `aa090a9f`. After the carry, check that `mc-prep.sh` and `mc-check.sh` name the new scratchpad (`grep -n "^SP=" mc-prep.sh mc-check.sh`) and fix them if not. The predecessor's own scratchpad (the session whose id starts `b7b9c852`, in the system temporary directory beside the new one) still holds the live build worktrees `mc-r2` (the combined check whose layout run was in progress at the relay), `mc-h1678`, `mc-h1677`, `mc-h1676` and `mc-r1`; read `check-r2/summary.txt` and `check-r2/layout.log` there, and `hs-probe1678-rg3.log` if its probe ran, because the durable copy was taken before they finished. Write any helper whose redirect target is a variable with the Write tool (the guardrail refuses a redirect to `$VAR`), and run scratchpad scripts after a `cd` into the scratchpad. Use `bash` loops in a script file, not zsh word splitting. Never put `rm -rf` of the Playwright lock after a `;` in a command that may not own the lock. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `cut-report.sh <worker log> <out>`; `batch-merge-body.sh <pr> <report> <sha prefix> [--ui-scope]` (scrub dashes and machine-path links from the report first; `--ui-scope` needs a `## Review harness` section; read its flag line, never chain `gh pr edit`); `lg-cases.sh <label> <run id>`; `err-blocks.sh <plain log> <spec fragment> [lines]`; `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `base-delta-overlap.sh <pr>:<ci base sha>...`; `diag-head.sh <label> <head sha> <spec regex>` (builds base plus one head and runs the matching specs once under the Playwright lock); `head-spec.sh <label> <worktree label> <spec regex> [grep]` (no repeat flag: loop it in a script for repeats); `repeat-spec.sh` takes one spec file on disk and waits for load under 20 while holding the lock, so prefer a `head-spec.sh` loop; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>` for a full combined check; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then add a case to `launch-rb.sh` and run it; `ticket-files.sh <n>`, `overlap-note.sh`, `compose-note.sh <n> <worktree> fix` and `launch-new.sh <n> <worktree>` for a new ticket; `add-pr.mjs <pr> <issue> <worktree name> <branch>` and `mark-merged.mjs <pr> <merge sha> '#<issue>'` keep the run state; `reconcile.mjs` reconciles the board with the spec. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. Start CI waiters with `--ceiling-minutes 90`. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

1. Read combined check r2 (base `273ad7f9` plus `ui#1673` `34cc1354`, `ui#1653` `dcf6b792`, `ui#1676` `0cd150d6`, `ui#1677` `f3349b5a`). Every step through the web build passed; read its layout result. If the layout run did not finish, rerun the layout step on `mc-r2` alone. On a green layout: merge `ui#1673` at `34cc1354` (approved after its push, 0 threads; its one CI red, `focus-rings` Calendário at 412 and 1280, is the `#1293` double ring that `ui#1653` fixes, proven by the probe in the spec), log that evidence, close `#1298`, tear down; then base-merge `ui#1653`, push, CI, fresh approval, merge, close `#1293`; merge `ui#1676` on the bar and close `#1315`.
2. `ui#1677` (`3d527052`): rerun `composer-hover-layout.spec.ts` (light cases five times) on a build of `3d527052`, wait for a fresh Pullfrog approval at that head, then merge and close `#1312`.
3. `ui#1678` (`#1290`): send one review batch with the three probe findings in the spec (the negative-margin scan counts screen-reader-only nodes; the habit detail fields open 20 below "Mais detalhes", not 12; one Perfil route shows no rows when `assertRows` counts), with a base merge; prove the five changed specs red on a base build (build first, then check out the head's `e2e/layout`) and green on the head; then CI, approval, a full combined check, merge.
4. After `ui#1673` merges: send `ui#1664` batch 6 (base merge resolving `mock-api/server.ts` into `request-handler.ts`, as the spec says), launch `#1316` with `note-1316.md` appended to its order, and send `ui#1674` its batch.
5. After `ui#1653` merges: `ui#1654` batch 1, then `#1299`. After `ui#1664` merges: `#1306` and `#1307`.
6. After this merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), run `ui#1669`'s staging sleep proof, and sweep the released commit with `sweep-order-1684ecee.md` retargeted; measure the 544 versus 580 content edge lead (`lead-544-580.md`) before filing it.
7. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1673` `34cc1354` (`#1298`) | approved, CI red only on the proven `#1293` focus-rings case; merge on green r2 (step 1) |
| `ui#1653` `dcf6b792` (`#1293`) | pushed, CI and review running; merges after `ui#1673` with a base merge (step 1) |
| `ui#1676` `0cd150d6` (`#1315`) | approved, proven 3 times 29/29; merge (step 1) |
| `ui#1677` `3d527052` (`#1312`) | thread fixed and resolved, needs a fresh approval and a head rerun (step 2) |
| `ui#1678` `0e64759d` (`#1290`) | real red in its own `row-geometry.spec.ts`; review batch (step 3) |
| `ui#1664` `c004b094` (`#1301`) | batch 5 pushed; conflicts with `ui#1673`; batch 6 after it merges (step 4) |
| `ui#1674` `c4eeec60` (`#1300`) | batch after `ui#1673` (step 4) |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` (step 5) |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | their latest runs read as cancelled duplicates; later batch |
| Workers, subagents | none running; the predecessor's local combined check r2 layout run and probe `rg3` may still be running in its scratchpad |
| CI waiters | none after the relay (the relay tool stops them); start new ones |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1646`, `ui#1647`, `ui#1653`, `ui#1654`, `ui#1664`, `ui#1673`, `ui#1674`, `ui#1676`, `ui#1677`, `ui#1678`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree is clean |
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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 138 open, 138 placed, 0 unplaced (`reconcile.mjs`), 0 placed twice by placement (ten open tickets, `#28`, `#179`, `#196`, `#237`, `#238`, `#385`, `#394`, `#418`, `#556`, `#746`, are also mentioned in a second batch as cross-references). The redesign has 12 open tickets: `#1286`, `#1290`, `#1293`, `#1298` to `#1301`, `#1306`, `#1307`, `#1312`, `#1315`, `#1316`. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried; helper notes add the `head-spec.sh` loop for repeats, the `repeat-spec.sh` lock warning, the `--ui-scope` requirement and the predecessor's live `mc-r2`.
- Step 1, `ui#1673` push and merge: pushed `34cc1354` and approved; its merge now waits on combined check r2 with `ui#1653` (step 1).
- Step 2, launches: done. `#1315` opened `ui#1676`, `#1312` opened `ui#1677`, `#1290` relaunched from its tree and opened `ui#1678`.
- Step 3, `ui#1664` batch 5: pushed `c004b094`; the full combined check found its conflict with `ui#1673`, so batch 6 follows (step 4). `#1306` and `#1307` carried (step 5).
- Step 4, `#1316` and `ui#1674` after `ui#1673`: carried (step 4); `note-1316.md` is written.
- Step 5, `ui#1653` after `#1316`: superseded. `ui#1673`'s stable header removes the `#1316` remount on web, so `ui#1653` was pushed (`dcf6b792`, report and review fix note in the body) and merges right after `ui#1673` (step 1). `ui#1654` and `#1299` carried (step 5).
- Step 6, release, Orbit Staging 1.3.73 and sweep: carried (step 6).
- Step 7, Batch R then the order: carried (step 7).

Every identifier here came from a previous session: treat each as a lead to verify.
