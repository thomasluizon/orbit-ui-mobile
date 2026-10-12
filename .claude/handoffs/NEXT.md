/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`, including the owner's gate review paragraph) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md`, `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, the decision log, the gate findings and the pt-BR audit in `ptbr/`) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, then check that `grep -n "^SP=" mc-prep.sh mc-check.sh mc-check-gated.sh gated-launch.sh prep-ticket.sh head-build.sh run-spec.sh` names the new scratchpad (rewrite any that still name an old one). New helpers: `mc-check-gated.sh <worktree> <label>` (waits for load under 20, then `mc-check.sh`), `measure-labels.cjs <px> <label>...` (one-line widths in Chromium with the shipped Geist), `red-batch1.sh` (pattern for a base red run of head specs). `prep-ticket.sh` now names worktrees `ticket-<issue>-<name>`. The earlier helpers and the shell cautions in the spec's `## Current state` still apply.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the owner's gate findings fixed and on his phone: the six open Batch R gate pull requests merged, staging web released, the next Orbit Staging internal build dispatched, and the owner told which findings each build fixes. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order` (`reconcile.mjs` in the scratchpad): 140 open, 140 placed, 0 unplaced, 0 placed twice. The run ends only when the spec is done or for an external cause.

## Then: the in-flight work, in this order

1. Read `check-five/summary.txt` in the scratchpad: the combined check of `ui#1729`, `ui#1730`, `ui#1725`, `ui#1727`, `ui#1728` on `b7f7c82f` passed everything but its hermetic layout run, which was running at the relay. If the summary has no `layout` line and no Playwright process is alive, kill the listeners on ports 5099 and 3000 first, then run the layout project alone in `mc-five` under the Playwright lock (`run-spec.sh <scratchpad>/mc-five five-layout` with no spec argument runs the whole project).
2. Start CI waiters (at most three, several `--pr` each) for `ui#1725`, `ui#1726`, `ui#1729`, `ui#1730`; read each with `pr-bar.sh`. `ui#1730`'s Layout Guard rerun (run 38300787433) is for the `calendar-day-link.spec.ts:89` flake.
3. Merge on the bar, in this order, each with `--match-head-commit` copied from this run's output: `ui#1729`, `ui#1730`, `ui#1725`, `ui#1727`, `ui#1728` (the combined check covers all five at their current heads; a head that moved needs its own check). A `calendar-day-habit-rows.spec.ts:26` or `calendar-day-link.spec.ts:89` red is the flake `ui#1728` fixes and a `conversation-thread-scroll.spec.ts:24` red is `#1356`: rerun once. A `Web image build` red reading `public.ecr.aws ... 429` is a registry limit: rerun.
4. `ui#1723`: in its worktree `ticket-1368-ptbr-copy`, merge `origin/redesign/main` (keep both sides' `CLAUDE.md` `DESIGN.md` row additions and every locale value), run both type checks, the three Vitest suites and i18n usage, build the head and run `label-fit-calendars-sheet.spec.ts` and `bell-first-frame.spec.ts` (green proves `Manter sincronizado` fits; if it still wraps at 320, change it to `Sincronizar sempre`), then set the body from the scratchpad `body-1723-new.md` (check it for machine paths and dashes) and push once. Merge on the bar.
5. `ui#1726` last: merge `origin/redesign/main` into its worktree `ticket-1364-segments`, resolve the `CLAUDE.md`, `pt-BR.json` and `onboarding-create-habit.tsx` conflicts keeping both sides, run the same checks plus the layout project, push, merge on the bar.
6. Close each ticket with `tools/complete-ticket.mjs` and tear down each worktree with `node tools/teardown-worktree.mjs`, one at a time.
7. After the merges: release staging web with `node tools/release-plan.mjs --environment staging --branch redesign/main` (the staging API is already at `0bed2af8`), dispatch the next Orbit Staging internal build, then tell the owner in one short report which of his findings each build fixes and what he can retest. A progress report leads with how many of the 22 plus the nine gate tickets remain (the 22 are closed; three gate tickets are closed, six are open).
8. File one Batch 2b ticket through `tools/create-ticket.mjs`: Android has no label-fit geometry case for the Calendários sheet rows (the web layout spec caught the wrapping auto-sync label; no Android test would have).
9. Keep answering the owner's screenshots: each finding becomes a Batch R ticket and a worker at once.
10. Then the rest of `## The order` after THE REDESIGN GATE, which still holds until the owner approves it.

## In flight

| item | disposition |
|---|---|
| `ui#1723` `71c69fbd` on GitHub (`#1368` pt-BR copy) | two local unpushed commits `309c865b`, `2108e0cd` on `fix/ticket-1368-ptbr-copy`; Pullfrog approved the old head; step 4 |
| `ui#1725` `b75d7d3b` (`#1367` Google sign-in) | approved at head, 0 threads; Layout Guard was running; step 3 |
| `ui#1726` `7beccfc0` (`#1364` segments) | approved at head, 0 threads; Layout Guard was running; merges last after a base merge (step 5) |
| `ui#1727` `61335424` (`#1365` onboarding back arrow) | all checks green, approved at head, 0 threads; step 3 |
| `ui#1728` `c253969d` (`#1361` Layout Guard flake) | all checks green, approved at head, 0 threads; step 3 |
| `ui#1729` `abdd630c` (`#1366` Hoje arrows) | approved at head; Unit Tests was running; layout cases proven red on the base; step 3 |
| `ui#1730` `a1a92a3a` (`#1369` weekday articles) | approved at head; Unit Tests running; Layout Guard rerun for the flake; step 3 |
| Merged this session | `orbit-api#711` (`#746` carry of `orbit-api#707` to `#710`) as `0bed2af8` on `orbit-api` `redesign/main`; `#746` stays open (standing) |
| Tickets closed this session | `#1371` (complete-ticket); board status repaired to Done on `#1370` and `#1372` |
| Tickets filed this session | none |
| Releases this session | staging API from `orbit-api` `redesign/main` at `0bed2af8` (run 38307848072, healthy) |
| Staging | API `0bed2af8`, web `bba283a7`, landing `a50de090`, Orbit Staging 1.3.78 (137) on internal; web and Android release owed (step 7) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; nothing released this session |
| Open pull requests | `orbit-ui-mobile` the seven above; `orbit-api` none; `orbit-landing-page` none |
| Workers, subagents, workflows | none running at handoff; worker logs are in the system temporary directory under `orbit-workers/` |
| Local checks | the combined check's layout run in `mc-five` (step 1) |
| CI waiters | none live (both ended at their ceiling); restart (step 2) |
| Stashes | none in the three checkouts |
| Uncommitted work | none in any ticket worktree; the main checkout holds only this handoff until its commit |
| Unpushed commits | `ui#1723`'s two commits above; none elsewhere |
| Branches with no pull request | none new |
| Detached HEADs | scratch build worktrees only: `mc-base3` at `b7f7c82f`, `mc-five` (combined tree), and six older scratch merges kept because they hold staged scratch files; none with work |
| Disk | 121 old scratch build worktrees removed; about 100 GB free |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água |
| Session chain | open; this is an automatic relay |
| Owner questions | none open; the gate approval waits on his testing |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner is awake and testing: answer each of his messages before other work, file a screenshot finding as a Batch R ticket and start its worker at once, never a question back. A progress report leads with how many redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task; gate each launch (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation launches and relaunches; a branch at its two launches needs `--relaunch-reason`; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; a branch that used its two launches is finished by the orchestrator as a review fix (strings, test assertions, a regenerated manifest, a base merge) when the remaining change is mechanical; one hermetic Playwright run at a time; at most three GitHub-calling waiters; read `gh run list --commit <sha>` before calling a check red, because a body edit leaves cancelled duplicate runs; a stale-base red never clears on a rerun; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output; a shell redirect target must be a literal path (the guardrail refuses `$VAR` targets). A worker's `NEEDS_DECISION` on copy is answered from `BRAND.md`, `DESIGN.md` Voice and the pt-BR rule, logged, and written to the ticket as a comment before the relaunch. New copy is approved with `/second-opinion` framed as a claimed defect, and the verdict is posted on the pull request. A Surface Manifest Drift red is regenerated by the orchestrator (`node tools/surface-manifest.mjs`), with both harnesses run after it. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: file his gate findings as tickets now and start fixing, without waiting for him to finish testing; fix the GitHub Actions failures he sees (the staging Postgres reconcile is fixed; the Layout Guard flake is `ui#1728`); no literal pt-BR translation anywhere in the app; no option row that wraps to a second line. THE REDESIGN GATE holds until he approves: never merge `redesign/main` to `main`. Where a control sits is the run's call.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph, the relay line and the owner instructions: carried.
- Step 1 (close `#1370`, `#1372`, `#1371`; tear down their worktrees): done; `#1371` closed, `#1370` and `#1372` were already closed and their board status repaired; the three worktrees were renamed to the `ticket-<n>` pattern and removed by the tool.
- Step 2 (CI waiters): done and carried as step 2 (the waiters ended at their ceiling).
- Step 3 (merge order `ui#1726` first): superseded by the conflict matrix in the spec's `## Current state`; the new order is steps 3 to 5.
- Step 4 (staging release, internal build, owner report): partly done (staging API released at `0bed2af8` after the `#746` carry); the rest carried as step 7.
- Steps 5 and 6 (owner screenshots, then the rest of the order): carried as steps 9 and 10.

Every identifier here came from a previous session: treat each as a lead to verify.
